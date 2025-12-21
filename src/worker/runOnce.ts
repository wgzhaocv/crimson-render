import { flushOnce } from "./flushOnce";

// 给 cron/手动执行用：跑一次就退出
try {
  const result = await flushOnce();
  console.log(
    `[flushOnce] totalUpdated=${result.totalUpdated} dailyUpdated=${result.dailyUpdated} eventsInserted=${result.eventsInserted}`,
  );
  process.exit(0);
} catch (err) {
  console.error("[flushOnce] failed:", err);
  process.exit(1);
}

