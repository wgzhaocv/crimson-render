import { flushOnce } from "./flushOnce";

// 常驻 worker：定时 flush（更稳定，不依赖系统 cron）
const INTERVAL_MS = Number.parseInt(Bun.env.FLUSH_INTERVAL_MS ?? "60000", 10);

let running = false;
const tick = async () => {
  if (running) return; // 防止重入
  running = true;
  try {
    const result = await flushOnce();
    if (result.totalUpdated || result.dailyUpdated || result.eventsInserted) {
      console.log(
        `[worker] totalUpdated=${result.totalUpdated} dailyUpdated=${result.dailyUpdated} eventsInserted=${result.eventsInserted}`,
      );
    }
  } catch (err) {
    console.error("[worker] flush failed:", err);
  } finally {
    running = false;
  }
};

await tick(); // 启动先跑一次
setInterval(tick, Math.max(1000, INTERVAL_MS));

