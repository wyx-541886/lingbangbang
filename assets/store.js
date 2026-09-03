/* ============================================================
   邻帮帮 · 数据层（对应小程序 app.js）
   积分 + 任务列表，localStorage 持久化
   ============================================================ */
const AppStore = (function () {
  const POINTS_KEY = 'linbangbang_user_points';
  const TASKS_KEY = 'linbangbang_tasks';
  const HEART_POOL_KEY = 'linbangbang_heart_pool'; // 爱心池：任务佣金抽成累积，界面不展示
  const CREDIT_KEY = 'linbangbang_credit'; // 信誉：score 0-100 + 变动记录
  const REVIEWS_KEY = 'linbangbang_reviews'; // 交付评分：发布者对完成度/态度的五星整星评价
  const APPEALS_KEY = 'linbangbang_appeals'; // 申诉案件：被差评方可发起申诉，交由大众评审团公开投票
  const USERS_KEY = 'linbangbang_users'; // 本地账号表：用户名 + 随机盐 + 加盐哈希（绝不存密码明文）
  const SESSION_KEY = 'linbangbang_session'; // 当前登录会话：{ username, loggedInAt }
  const GIFT_KEY = 'linbangbang_gift_log'; // 积分赠送流水：邻里间积分让渡记录
  const GUARD_KEY = 'linbangbang_auth_guard'; // 防刷守卫：近窗口内的注册时间戳
  const GUARD_REG_WINDOW_MS = 10 * 60 * 1000; // 防刷：注册时间窗 = 10 分钟
  const GUARD_REG_LIMIT = 3; // 时间窗内本机最多可注册的账号数
  const GUARD_MAX_USERS = 20; // 本机演示账号上限，防止本地存储被无限塞账号撑爆
  const LOGIN_MAX_FAIL = 5; // 登录防爆破：同一用户名连续输错 N 次开始锁定
  const LOCK_STEPS = [30000, 60000, 120000, 300000, 600000]; // 锁定逐级递增退避：30s / 1m / 2m / 5m / 10m
  const COMMISSION_RATE = 0.2; // 任务佣金抽成比例：20%
  const APPEAL_VOTE_NEED = 3; // 评审团裁决门槛：某一方向票数达到该值
  const mem = { points: null, tasks: null, heartPool: null, credit: null, reviews: null, appeals: null, gifts: null, users: null, guard: null, session: null };

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }

  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* 忽略 */ }
  }

  /* ===================== 数据卫生：防脏数据 / 防注入 / 防异常膨胀 =====================
     信任边界说明：localStorage 可能被浏览器插件、跨设备导入或未来云端同步写入
     非预期内容（畸形对象、超长文本、错误类型、恶意字符串）。因此所有集合在进入
     内存前统一做“类型化 + 长度钳制 + 剔除残次项”，保证渲染层拿到的永远是干净数据：
     单个脏对象不会拖垮整页，脏字符串也进不了 innerHTML。 */
  function toNum(v, fb, min, max) {
    const n = Number(v);
    if (!isFinite(n)) return fb;
    if (min != null && n < min) return min;
    if (max != null && n > max) return max;
    return n;
  }
  function toStr(v, fb, max) {
    const s = String(v == null ? fb : v);
    return typeof max === 'number' ? s.slice(0, max) : s;
  }

  // 账号表数据卫生：剔除缺关键字段的残次账号，其余字段类型化 + 长度钳制
  function normalizeUsers(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length && out.length < GUARD_MAX_USERS; i += 1) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      const username = toStr(raw.username, '', 20);
      const salt = toStr(raw.salt, '', 64);
      const pwdHash = toStr(raw.pwdHash, '', 128);
      if (!username || !salt || !pwdHash) continue;
      const now = Date.now();
      out.push({
        username: username,
        salt: salt,
        pwdHash: pwdHash,
        nickname: toStr(raw.nickname, '邻友', 12),
        createdAt: toNum(raw.createdAt, now, 0, now + 86400000),
        lastLoginAt: toNum(raw.lastLoginAt, 0, 0, now + 86400000),
        points: toNum(raw.points, 100, 0, 1000000), // 账号积分钱包：赠送让渡时接收方据此入账
        fail: toNum(raw.fail, 0, 0, 100),
        lockCount: toNum(raw.lockCount, 0, 0, 10),
        lockedUntil: toNum(raw.lockedUntil, 0, 0, now + 7 * 86400000)
      });
    }
    return out;
  }

  // 按用户名查找账号（内部使用，可能返回含盐与哈希的完整记录）
  function findUser(username) {
    const n = String(username == null ? '' : username);
    if (!mem.users) return null;
    for (let i = 0; i < mem.users.length; i += 1) {
      if (mem.users[i].username === n) return mem.users[i];
    }
    return null;
  }

  function normalizeTasks(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      const id = toStr(raw.id, '', 40);
      const title = toStr(raw.title, '', 60);
      if (!id || !title) continue; // 无 id / 无标题的残次任务直接剔除
      const t = {
        id: id,
        title: title,
        desc: toStr(raw.desc, '', 400),
        reward: toNum(raw.reward, 0, 0, 1000000),
        status: raw.status === 'doing' ? 'doing' : raw.status === 'done' ? 'done' : 'pending',
        createTime: toStr(raw.createTime, '', 60)
      };
      if (typeof raw.pubHonorIdx !== 'undefined') t.pubHonorIdx = toNum(raw.pubHonorIdx, 0, 0, 4);
      if (raw.pubHonorName != null) t.pubHonorName = toStr(raw.pubHonorName, '', 20);
      if (Array.isArray(raw.rewardLog)) {
        const logs = [];
        for (let j = Math.max(0, raw.rewardLog.length - 20); j < raw.rewardLog.length; j += 1) {
          const r = raw.rewardLog[j];
          if (!r || typeof r !== 'object') continue;
          logs.push({ add: toNum(r.add, 0, 0, 1000000), total: toNum(r.total, 0, 0, 1000000), time: toStr(r.time, '', 60) });
        }
        if (logs.length) t.rewardLog = logs;
      }
      out.push(t);
    }
    return out;
  }

  function normalizeReviews(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length && out.length < 50; i += 1) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      const id = toStr(raw.id, '', 40);
      const taskId = toStr(raw.taskId, '', 40);
      if (!id || !taskId) continue;
      const it = {
        id: id,
        taskId: taskId,
        taskTitle: toStr(raw.taskTitle, '邻里任务', 60),
        completion: toNum(raw.completion, 3, 1, 5),
        attitude: toNum(raw.attitude, 3, 1, 5),
        avg: toNum(raw.avg, 3, 1, 5),
        delta: toNum(raw.delta, 0, -5, 5),
        comment: toStr(raw.comment, '', 120),
        time: toStr(raw.time, '', 60)
      };
      if (raw.appealStatus === 'upheld' || raw.appealStatus === 'rejected') it.appealStatus = raw.appealStatus;
      out.push(it);
    }
    return out;
  }

  function normalizeAppeals(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      const id = toStr(raw.id, '', 40);
      const taskId = toStr(raw.taskId, '', 40);
      if (!id || !taskId) continue;
      const review = raw.review && typeof raw.review === 'object'
        ? {
            completion: toNum(raw.review.completion, 3, 1, 5),
            attitude: toNum(raw.review.attitude, 3, 1, 5),
            avg: toNum(raw.review.avg, 3, 1, 5),
            delta: toNum(raw.review.delta, 0, -5, 5),
            comment: toStr(raw.review.comment, '', 120),
            time: toStr(raw.review.time, '', 60)
          }
        : null;
      if (!review) continue; // 缺少原评审快照的案件无法裁决，剔除
      const it = {
        id: id,
        taskId: taskId,
        reviewId: toStr(raw.reviewId, '', 40),
        taskTitle: toStr(raw.taskTitle, '邻里任务', 60),
        reason: toStr(raw.reason, '', 200),
        status: raw.status === 'upheld' ? 'upheld' : raw.status === 'rejected' ? 'rejected' : 'voting',
        review: review,
        votes: [],
        created: toStr(raw.created, '', 60),
        closed: raw.closed ? toStr(raw.closed, '', 60) : null
      };
      if (Array.isArray(raw.votes)) {
        for (let j = 0; j < raw.votes.length; j += 1) {
          const v = raw.votes[j];
          if (!v || typeof v !== 'object') continue;
          const side = v.side === 'support' ? 'support' : v.side === 'reject' ? 'reject' : null;
          if (side) it.votes.push({ side: side, at: toStr(v.at, '', 60) });
        }
      }
      out.push(it);
    }
    return out;
  }

  // 赠送流水数据卫生：双向用户名必填，数量类型化 + 钳制，防止脏条目撑爆展示
  function normalizeGifts(list) {
    if (!Array.isArray(list)) return [];
    const out = [];
    for (let i = 0; i < list.length && out.length < 60; i += 1) {
      const raw = list[i];
      if (!raw || typeof raw !== 'object') continue;
      const from = toStr(raw.from, '', 20);
      const to = toStr(raw.to, '', 20);
      if (!from || !to) continue;
      out.push({ from: from, to: to, amount: toNum(raw.amount, 0, 1, 1000000), time: toStr(raw.time, '', 60) });
    }
    return out;
  }

  function normalizeCredit(credit) {
    if (!credit || typeof credit !== 'object') return { score: 100, history: [] };
    const score = Number(credit.score);
    const history = Array.isArray(credit.history) ? credit.history : [];
    const out = { score: isFinite(score) ? Math.max(0, Math.min(100, score)) : 100, history: [] };
    for (let i = 0; i < history.length && out.history.length < 50; i += 1) {
      const raw = history[i];
      if (!raw || typeof raw !== 'object') continue;
      const d = toNum(raw.delta, 0, -100, 100);
      const it = { time: toStr(raw.time, '', 60), delta: d, text: toStr(raw.text, '', 200) };
      if (typeof raw.starAvg === 'number') it.starAvg = Math.max(0, Math.min(5, raw.starAvg));
      out.history.push(it);
    }
    return out;
  }

  // 首次启动：积分 100，任务空数组；读入的所有集合统一过数据卫生层
  function init() {
    let points = read(POINTS_KEY, null);
    if (typeof points !== 'number' || !isFinite(points)) {
      points = 100;
      write(POINTS_KEY, points);
    } else {
      points = Math.max(0, Math.min(1000000, points)); // 钳制异常越界值
    }
    mem.points = points;

    let tasks = read(TASKS_KEY, null);
    if (!Array.isArray(tasks)) {
      tasks = [];
      write(TASKS_KEY, tasks);
    }
    mem.tasks = normalizeTasks(tasks);

    // 爱心池初始为 0（不随用户积分重置而清空）
    let heartPool = read(HEART_POOL_KEY, null);
    if (typeof heartPool !== 'number' || !isFinite(heartPool)) {
      heartPool = 0;
      write(HEART_POOL_KEY, heartPool);
    } else {
      heartPool = Math.max(0, Math.min(10000000, heartPool));
    }
    mem.heartPool = heartPool;

    // 信誉分：初始 100（满分 100），保留最近变动记录
    let credit = read(CREDIT_KEY, null);
    if (!credit || typeof credit !== 'object') {
      credit = { score: 100, history: [] };
      write(CREDIT_KEY, credit);
    } else {
      credit = normalizeCredit(credit);
    }
    mem.credit = credit;

    // 交付评分记录：旧数据无此 key 时初始化为空数组
    let reviews = read(REVIEWS_KEY, null);
    if (!Array.isArray(reviews)) {
      reviews = [];
      write(REVIEWS_KEY, reviews);
    }
    mem.reviews = normalizeReviews(reviews);

    // 申诉案件：旧数据无此 key 时初始化为空数组
    let appeals = read(APPEALS_KEY, null);
    if (!Array.isArray(appeals)) {
      appeals = [];
      write(APPEALS_KEY, appeals);
    }
    mem.appeals = normalizeAppeals(appeals);

    // 积分赠送流水：无数据时初始化为空数组
    let gifts = read(GIFT_KEY, null);
    if (!Array.isArray(gifts)) {
      gifts = [];
      write(GIFT_KEY, gifts);
    }
    mem.gifts = normalizeGifts(gifts);

    // 账号密码体系：旧版「手机号登记」数据已被放弃（改用账号密码登录），读到即清除
    try {
      if (localStorage.getItem('linbangbang_account') !== null) localStorage.removeItem('linbangbang_account');
    } catch (e) { /* 忽略 */ }

    let users = read(USERS_KEY, null);
    if (!Array.isArray(users)) {
      users = [];
      write(USERS_KEY, users);
    }
    mem.users = normalizeUsers(users);

    // 防刷守卫：只保留仍在时间窗内的注册时间戳
    let guard = read(GUARD_KEY, null);
    if (!guard || !Array.isArray(guard.regs)) guard = { regs: [] };
    const cut = Date.now() - GUARD_REG_WINDOW_MS;
    guard.regs = guard.regs.map(Number).filter(function (t) { return isFinite(t) && t > cut; });
    write(GUARD_KEY, guard);
    mem.guard = guard;

    // 会话恢复：session 里的用户名必须真实存在才有效，否则按游客处理
    let session = read(SESSION_KEY, null);
    if (!session || typeof session !== 'object' || !findUser(toStr(session.username, '', 20))) {
      session = null;
    }
    mem.session = session;
  }
  init();

  /* 积分钱包：账号密码体系落地后，积分跟随「当前登录账号」记账，
     这样才能把积分真正的让渡到对方账号上（赠送闭环）。
     已登录 → 该账号的 points；未登录（游客）→ 全局体验积分（本机共享一条）。 */
  function getPoints() {
    const u = getCurrentUser();
    return u ? (Number(u.points) || 0) : mem.points;
  }

  // 修改当前钱包积分：余额不足返回 null，否则返回新余额
  function changePoints(delta) {
    const d = Number(delta) || 0;
    const u = getCurrentUser();
    if (u) {
      const next = (Number(u.points) || 0) + d;
      if (next < 0) return null;
      u.points = next;
      saveUsers();
      return next;
    }
    const next = mem.points + d;
    if (next < 0) return null;
    mem.points = next;
    write(POINTS_KEY, next);
    return next;
  }

  function getTasks() { return mem.tasks; }

  function saveTasks(list) {
    mem.tasks = list;
    write(TASKS_KEY, list);
  }

  // 重置当前钱包为 100（已登录 → 该账号积分；游客 → 全局体验积分）
  function resetPoints() {
    const u = getCurrentUser();
    if (u) {
      u.points = 100;
      saveUsers();
      return 100;
    }
    mem.points = 100;
    write(POINTS_KEY, 100);
    return mem.points;
  }

  function clearTasks() {
    saveTasks([]);
    mem.appeals = [];
    write(APPEALS_KEY, mem.appeals);
  }

  function getHeartPool() { return mem.heartPool; }

  /* 任务佣金结算：按比例抽取积分注入爱心池，返回接取者实际所得
     - 抽成 = Math.floor(reward * 比例)，向下取整，避免凭空产生积分
     - 接取者实得 = reward - 抽成，余量更友好 */
  function calcTaskReward(reward, rate) {
    const rewardNum = Number(reward) || 0;
    const r = Number(rate) >= 0 && Number(rate) < 1 ? Number(rate) : COMMISSION_RATE;
    const commission = Math.floor(rewardNum * r);
    return { gain: rewardNum - commission, commission: commission };
  }

  // 计算并真正将抽成注入爱心池（仅在接取确认后调用）
  function settleTaskReward(reward, rate) {
    const s = calcTaskReward(reward, rate);
    if (s.commission > 0) {
      mem.heartPool += s.commission;
      write(HEART_POOL_KEY, mem.heartPool);
    }
    return s;
  }

  // 追加积分悬赏：发布者给仍未被接取的任务追加悬赏金额（从当前积分实时扣减）
  function addBounty(taskId, addAmount) {
    const id = String(taskId == null ? '' : taskId);
    const amount = Math.floor(Number(addAmount) || 0);
    if (amount <= 0) return { ok: false, msg: '请填写大于 0 的整数积分' };
    if (amount > getPoints()) return { ok: false, msg: '积分不足，无法追加悬赏' };
    const t = mem.tasks.find(function (x) { return String(x.id) === id; });
    if (!t) return { ok: false, msg: '任务不存在或已被移除' };
    if (t.status !== 'pending') return { ok: false, msg: '任务已被接取或已完成，无法追加悬赏' };
    const after = changePoints(-amount);
    if (after === null) return { ok: false, msg: '积分不足，无法追加悬赏' };
    t.reward = (Number(t.reward) || 0) + amount;
    if (!Array.isArray(t.rewardLog)) t.rewardLog = [];
    t.rewardLog.push({ add: amount, total: t.reward, time: new Date().toLocaleString() });
    if (t.rewardLog.length > 20) t.rewardLog.length = 20;
    write(TASKS_KEY, mem.tasks);
    return { ok: true, reward: t.reward, points: after };
  }

  /* ===================== 信誉分 ===================== */
  function getCreditScore() { return mem.credit.score; }

  function getCreditHistory() { return mem.credit.history; }

  // 变动信誉：delta 正为加分、负为扣分，分数夹在 0-100；text 为变动说明（记入明细）
  // meta 可选：{ starAvg } 供明细展示本次评分均星
  function changeCredit(delta, text, meta) {
    const d = Math.round(Number(delta) || 0);
    if (!d) return mem.credit.score;
    mem.credit.score = Math.max(0, Math.min(100, mem.credit.score + d));
    if (text) {
      const item = {
        time: new Date().toLocaleString(),
        delta: d,
        text: String(text)
      };
      if (meta && typeof meta.starAvg === 'number') item.starAvg = meta.starAvg;
      mem.credit.history.unshift(item);
      if (mem.credit.history.length > 50) mem.credit.history.length = 50;
    }
    write(CREDIT_KEY, mem.credit);
    return mem.credit.score;
  }

  /* ===================== 交付评分系统 ===================== */
  // 星级取值合法化：只允许整颗星（1~5），历史遗留的 0.5 步进值会吸附到最近整星
  function clampStar(v) {
    if (!isFinite(v)) v = 3;
    return Math.max(1, Math.min(5, Math.round(Number(v))));
  }

  // 换算规则：以 3 星为公平基准，每高/低 0.25 星信誉 ±1（即每 1 星 ±4）
  // 单次封顶：最高 +5、最低 -5，防信誉暴涨暴跌
  function calcReviewDelta(completion, attitude) {
    const avg = Math.round((completion + attitude) / 2 * 4) / 4; // 两维均值，0.25 步
    return Math.max(-5, Math.min(5, Math.round((avg - 3) * 4)));
  }

  // 记录一次发布者验收评分：换算信誉 + 追加评价记录，返回 {avg, delta, ...}
  function addReview(info) {
    const completion = clampStar(Number(info.completion));
    const attitude = clampStar(Number(info.attitude));
    const avg = Math.round((completion + attitude) / 2 * 4) / 4;
    const delta = calcReviewDelta(completion, attitude);
    const rec = {
      id: String(Date.now()),
      taskId: String(info.taskId == null ? '' : info.taskId),
      taskTitle: String(info.taskTitle == null ? '邻里任务' : info.taskTitle),
      completion: completion,
      attitude: attitude,
      avg: avg,
      delta: delta,
      comment: String(info.comment == null ? '' : info.comment).slice(0, 120),
      time: new Date().toLocaleString()
    };
    if (delta) {
      const part = delta > 0 ? '交付到位，获邻里好评' : '交付质量欠佳，获邻里差评';
      changeCredit(delta,
        '任务《' + rec.taskTitle + '》验收：完成度 ' + completion + '★ + 态度 ' + attitude + '★（均星 ' + avg + '），' + part,
        { starAvg: avg });
    }
    mem.reviews.unshift(rec);
    if (mem.reviews.length > 50) mem.reviews.length = 50;
    write(REVIEWS_KEY, mem.reviews);
    return rec;
  }

  // 全部验收评分记录（含被评审撤销的，调用方自行过滤展示）
  function getReviews() { return mem.reviews; }

  // 某笔任务是否已有验收评分
  function getReviewByTask(taskId) {
    const id = String(taskId == null ? '' : taskId);
    for (let i = 0; i < mem.reviews.length; i += 1) {
      if (mem.reviews[i].taskId === id) return mem.reviews[i];
    }
    return null;
  }

  // 综合评分统计：完成度均值、态度均值、综合均星
  // 经大众评审团裁定撤销（upheld）的差评不计入统计
  function getRatingSummary() {
    const valid = mem.reviews.filter(function (r) { return r.appealStatus !== 'upheld'; });
    const n = valid.length;
    if (!n) return null;
    let c = 0;
    let a = 0;
    valid.forEach(function (r) { c += r.completion; a += r.attitude; });
    const round = function (x) { return Math.round(x * 100) / 100; };
    return {
      count: n,
      completion: round(c / n),
      attitude: round(a / n),
      avg: round((c + a) / (2 * n))
    };
  }

  /* ===================== 申诉 & 大众评审团 ===================== */
  function getAppeals() { return mem.appeals.slice(); }

  function getAppealByTaskId(taskId) {
    const id = String(taskId == null ? '' : taskId);
    for (let i = 0; i < mem.appeals.length; i += 1) {
      if (mem.appeals[i].taskId === id) return mem.appeals[i];
    }
    return null;
  }

  function getAppealById(id) {
    for (let i = 0; i < mem.appeals.length; i += 1) {
      if (mem.appeals[i].id === id) return mem.appeals[i];
    }
    return null;
  }

  // 统计一桩申诉当前的票箱：{ support: 支持申诉票数, reject: 维持差评票数 }
  function countAppealVotes(a) {
    let support = 0;
    let reject = 0;
    (a.votes || []).forEach(function (v) {
      if (v.side === 'support') support += 1;
      else if (v.side === 'reject') reject += 1;
    });
    return { support: support, reject: reject };
  }

  // 被差评方提交申诉（一笔任务只可申诉一次）
  function submitAppeal(info) {
    const taskId = String(info.taskId == null ? '' : info.taskId);
    if (getAppealByTaskId(taskId)) {
      return { ok: false, msg: '该任务已提交过申诉，请前往大众评审团查看进展' };
    }
    const rv = getReviewByTask(taskId);
    if (!rv) return { ok: false, msg: '该任务还没有验收评分，无法申诉' };
    if (rv.delta >= 0) return { ok: false, msg: '本次验收未扣信誉，无需申诉' };
    const reason = String(info.reason == null ? '' : info.reason).trim().slice(0, 200);
    if (!reason) return { ok: false, msg: '请先说明你的申诉理由' };

    const a = {
      id: String(Date.now()) + '-' + Math.floor(Math.random() * 1000),
      taskId: taskId,
      reviewId: rv.id,
      taskTitle: rv.taskTitle,
      review: {
        completion: rv.completion,
        attitude: rv.attitude,
        avg: rv.avg,
        delta: rv.delta,
        comment: rv.comment,
        time: rv.time
      },
      reason: reason,
      status: 'voting', // voting 评审中 / upheld 申诉成立 / rejected 维持差评
      votes: [],
      created: new Date().toLocaleString(),
      closed: null
    };
    mem.appeals.unshift(a);
    write(APPEALS_KEY, mem.appeals);
    return { ok: true, appeal: a };
  }

  // 某票是否使双方中一方达到裁决条件：任一方向 ≥3 票且领先 ≥2
  function canDecide(support, reject) {
    const high = Math.max(support, reject);
    return high >= APPEAL_VOTE_NEED && Math.abs(support - reject) >= 2;
  }

  // 邻里投票：side = support（支持申诉，撤销差评）| reject（维持差评）
  // 达到裁决条件即自动结案；申诉成立会撤销该次差评并恢复信誉
  function voteAppeal(appealId, side) {
    const a = getAppealById(String(appealId));
    if (!a || a.status !== 'voting') {
      return { ok: false, msg: '该申诉已结案或不存在' };
    }
    if (side !== 'support' && side !== 'reject') return { ok: false, msg: '无效的投票' };

    a.votes.push({ side: side, at: new Date().toLocaleString() });
    const c = countAppealVotes(a);

    let decided = false;
    let result = null;
    if (canDecide(c.support, c.reject)) {
      decided = true;
      result = c.support > c.reject ? 'upheld' : 'rejected';
    }

    if (decided) {
      a.status = result;
      a.closed = new Date().toLocaleString();
      const rv = getReviewByTask(a.taskId);
      if (result === 'upheld') {
        // 撤销扣分：把该笔差评扣掉的信誉加回，并公示撤销状态
        if (rv && rv.delta < 0 && rv.appealStatus !== 'upheld') {
          rv.appealStatus = 'upheld';
          write(REVIEWS_KEY, mem.reviews);
          changeCredit(-rv.delta,
            '任务《' + a.taskTitle + '》差评经大众评审团裁定申诉成立，原扣 ' + rv.delta + ' 分已撤销，信誉恢复',
            { appeal: 'upheld' });
        }
      } else if (rv) {
        rv.appealStatus = 'rejected';
        write(REVIEWS_KEY, mem.reviews);
      }
    }
    write(APPEALS_KEY, mem.appeals);
    return { ok: true, decided: decided, result: result, appeal: a, support: c.support, reject: c.reject };
  }

  function resetCredit() {
    mem.credit = { score: 100, history: [] };
    mem.reviews = [];
    mem.appeals = [];
    write(CREDIT_KEY, mem.credit);
    write(REVIEWS_KEY, mem.reviews);
    write(APPEALS_KEY, mem.appeals);
    return mem.credit.score;
  }

  /* ===================== 账号密码认证（本地演示级） =====================
     设计要点：
     1. 放弃「手机号 + 短信验证码」，改为 用户名 + 密码 注册 / 登录；
     2. 密码绝不明文落盘：只保存「随机盐 + 加盐哈希」（哈希由调用方用 WebCrypto 计算后传入）；
     3. 简易防刷（三层闸门，全部在数据层强制，改页面按钮绕不过）：
        · 密码强度——由 UI 层保证 ≥8 位且含字母与数字，杜绝弱口令被爆破；
        · 注册频率——同一浏览器每 10 分钟最多注册 3 个账号，防批量注号；
        · 失败锁定——同一用户名连续输错 5 次即锁定，锁定时长按
          30 秒 / 1 分 / 2 分 / 5 分 / 10 分逐级递增退避；
     4. 诚实边界：以上防线绑定「这台浏览器」，清空浏览器数据即可重置。
        真正的 IP / 设备级限流与图形验证码，需要等 CloudBase 服务端落地，
        纯前端本地版无法替代。 */
  function getSession() {
    return mem.session ? { username: mem.session.username, loggedInAt: mem.session.loggedInAt } : null;
  }

  // 当前登录账号（含盐与哈希的完整记录，仅供内部与登录校验使用）
  function getCurrentUser() {
    if (!mem.session) return null;
    const u = findUser(mem.session.username);
    if (!u) {
      mem.session = null;
      try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 忽略 */ }
      return null;
    }
    return u;
  }

  // 对外展示用的账号档案（不含任何密码相关字段）
  function getUserPublic(username) {
    const u = findUser(username);
    if (!u) return null;
    return {
      username: u.username,
      nickname: u.nickname,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt
    };
  }

  // 登录前向调用方提供该用户名的随机盐（用于计算同一加盐哈希；不存在则返回 null）
  function getSalt(username) {
    const u = findUser(String(username == null ? '' : username));
    return u ? u.salt : null;
  }

  function saveUsers() { write(USERS_KEY, mem.users); }

  function setSession(username) {
    mem.session = { username: username, loggedInAt: Date.now() };
    write(SESSION_KEY, mem.session);
  }

  // 注册：{ username, salt, pwdHash, nickname }；注册成功即自动登录
  function register(info) {
    const username = String(info.username == null ? '' : info.username).trim();
    const salt = String(info.salt == null ? '' : info.salt).slice(0, 64);
    const pwdHash = String(info.pwdHash == null ? '' : info.pwdHash).slice(0, 128);
    const nickname = String(info.nickname == null ? '' : info.nickname).trim().slice(0, 12) || '邻友';
    if (!username || !salt || !pwdHash) return { ok: false, msg: '注册信息不完整，请重试' };
    if (mem.users.length >= GUARD_MAX_USERS) {
      return { ok: false, msg: '本机可注册账号数已达上限，请先退出并清理旧账号' };
    }
    if (findUser(username)) return { ok: false, msg: '该用户名已被注册，请换一个' };

    const now = Date.now();
    mem.guard.regs = mem.guard.regs.filter(function (t) { return t > now - GUARD_REG_WINDOW_MS; });
    if (mem.guard.regs.length >= GUARD_REG_LIMIT) {
      const waitMin = Math.ceil((mem.guard.regs[0] + GUARD_REG_WINDOW_MS - now) / 60000);
      return { ok: false, msg: '注册过于频繁，请 ' + Math.max(1, waitMin) + ' 分钟后再试（防恶意刷号）' };
    }

    const user = {
      username: username,
      salt: salt,
      pwdHash: pwdHash,
      nickname: nickname,
      createdAt: now,
      lastLoginAt: now,
      points: mem.points, // 账号钱包 = 注册前的游客体验积分（注册即把体验分并入自己的邻里身份）
      fail: 0,
      lockCount: 0,
      lockedUntil: 0
    };
    mem.users.push(user);
    // 游客体验钱包回到初始 100，供本机后续访客 / 其他邻里体验使用
    mem.points = 100;
    write(POINTS_KEY, mem.points);
    mem.guard.regs.push(now);
    write(GUARD_KEY, mem.guard);
    saveUsers();
    setSession(username);
    return { ok: true, user: getUserPublic(username) };
  }

  // 密码验身核心（登录 / 赠送复核共用）：比对加盐哈希；失败即计数并逐级递增锁定。
  // 成功会清零失败计数与锁定状态；调用方需在成功后自行 saveUsers() 落盘
  function checkPwd(u, pwdHash) {
    const now = Date.now();
    if (u.lockedUntil > now) {
      const left = Math.ceil((u.lockedUntil - now) / 1000);
      return { ok: false, msg: '尝试次数过多已临时锁定，请 ' + left + ' 秒后再试', locked: left };
    }
    if (u.pwdHash !== pwdHash) {
      u.fail = Math.min(u.fail + 1, 100);
      if (u.fail >= LOGIN_MAX_FAIL) {
        const idx = Math.min(u.lockCount || 0, LOCK_STEPS.length - 1);
        u.lockedUntil = now + LOCK_STEPS[idx];
        u.lockCount = (u.lockCount || 0) + 1;
        saveUsers();
        const left = Math.ceil(LOCK_STEPS[idx] / 1000);
        return { ok: false, msg: '连续输错次数过多，账号已临时锁定 ' + left + ' 秒', locked: left };
      }
      saveUsers();
      return { ok: false, msg: '密码不正确（还可尝试 ' + (LOGIN_MAX_FAIL - u.fail) + ' 次）' };
    }
    u.fail = 0;
    u.lockCount = 0;
    u.lockedUntil = 0;
    return { ok: true };
  }

  // 登录：{ username, pwdHash }；对「用户名不存在」与「密码错误」统一报错，不泄露账号是否存在
  function login(info) {
    const username = String(info.username == null ? '' : info.username).trim();
    const pwdHash = String(info.pwdHash == null ? '' : info.pwdHash).slice(0, 128);
    if (!username || !pwdHash) return { ok: false, msg: '请输入用户名和密码' };
    const u = findUser(username);
    if (!u) return { ok: false, msg: '用户名或密码不正确' };
    const c = checkPwd(u, pwdHash);
    if (!c.ok) return { ok: false, msg: c.msg, locked: c.locked };
    u.lastLoginAt = Date.now();
    saveUsers();
    setSession(username);
    return { ok: true, user: getUserPublic(username) };
  }

  /* 积分赠送：把当前账号的部分积分让渡给另一位邻里。
     三道关卡全部在数据层强制，改页面按钮绕不过：
     ① 接收者必须真实存在且非本人（找不到的用户不会凭空造出积分）；
     ② 赠送量须为 >0 整数且不超过当前余额；
     ③ 复核本人登录密码——与登录共用同一套失败计数与逐级锁定，防暴力试密码。
     成功后双方余额即时落盘，并写入一条赠送流水（供收送双方查看）。 */
  function giftPoints(info) {
    const from = getCurrentUser();
    if (!from) return { ok: false, msg: '请先登录后再赠送积分' };
    const toName = String(info.to == null ? '' : info.to).trim().slice(0, 20);
    const pwdHash = String(info.pwdHash == null ? '' : info.pwdHash).slice(0, 128);
    const amount = Math.floor(Number(info.amount));
    if (!toName || !pwdHash) return { ok: false, msg: '请填写对方用户名、赠送数量与登录密码' };
    if (toName === from.username) return { ok: false, msg: '积分不能赠送给自己' };
    const to = findUser(toName);
    if (!to) return { ok: false, msg: '没有找到用户 @' + toName + '，请核对用户名后重试' };
    if (!isFinite(amount) || amount <= 0) return { ok: false, msg: '赠送数量须为大于 0 的整数' };
    if (amount > (Number(from.points) || 0)) return { ok: false, msg: '积分不足，无法赠送' };

    const c = checkPwd(from, pwdHash);
    if (!c.ok) return { ok: false, msg: c.msg, locked: c.locked };

    from.points = (Number(from.points) || 0) - amount;
    to.points = (Number(to.points) || 0) + amount;
    saveUsers();
    mem.gifts.unshift({ from: from.username, to: to.username, amount: amount, time: new Date().toLocaleString() });
    if (mem.gifts.length > 60) mem.gifts.length = 60;
    write(GIFT_KEY, mem.gifts);
    return { ok: true, amount: amount, to: to.username, points: from.points };
  }

  // 某人相关的赠送流水（送出 + 收到，按时间倒序），供 UI 展示往来记录
  function getGiftLog(username) {
    const name = String(username == null ? '' : username);
    const rows = [];
    for (let i = 0; i < mem.gifts.length && rows.length < 10; i += 1) {
      const g = mem.gifts[i];
      if (g.from === name || g.to === name) rows.push(g);
    }
    return rows;
  }

  // 退出登录：仅清除会话，账号与邻里数据全部保留
  function logout() {
    mem.session = null;
    try { localStorage.removeItem(SESSION_KEY); } catch (e) { /* 忽略 */ }
    return true;
  }

  // 注销清空：移除本应用在当前浏览器里的全部本地数据（含账户与邻里数据）
  function wipeLocalData() {
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.indexOf('linbangbang_') === 0) keys.push(k);
    }
    keys.forEach(function (k) {
      try { localStorage.removeItem(k); } catch (e) { /* 忽略 */ }
    });
    init(); // 用默认值重建内存态，后续操作依然可用
    return true;
  }

  return {
    getPoints,
    changePoints,
    getTasks,
    saveTasks,
    resetPoints,
    clearTasks,
    getHeartPool,
    calcTaskReward,
    settleTaskReward,
    addBounty,
    getCreditScore,
    getCreditHistory,
    changeCredit,
    calcReviewDelta,
    addReview,
    getReviewByTask,
    getReviews,
    getRatingSummary,
    resetCredit,
    getAppeals,
    getAppealByTaskId,
    countAppealVotes,
    submitAppeal,
    voteAppeal,
    getSession,
    getCurrentUser,
    getUserPublic,
    getSalt,
    register,
    login,
    logout,
    giftPoints,
    getGiftLog,
    wipeLocalData
  };
})();
