export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startFlowScheduler } = await import("./utils/email/flow-scheduler");
    startFlowScheduler();
  }
}
