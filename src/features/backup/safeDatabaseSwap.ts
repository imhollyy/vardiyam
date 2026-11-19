export type DatabaseSwapEffects = {
  markStaging: () => Promise<void>;
  prepareStage: () => Promise<void>;
  prepareRollback: () => Promise<void>;
  markPrepared: () => Promise<void>;
  closeLive: () => Promise<void>;
  replaceLive: () => Promise<void>;
  reopenAndValidate: () => Promise<void>;
  markCommitted: () => Promise<void>;
  restoreRollback: () => Promise<void>;
  cleanupUncommitted: () => Promise<void>;
  cleanupCommitted: () => Promise<void>;
};

export async function executeSafeDatabaseSwap(effects: DatabaseSwapEffects): Promise<void> {
  let prepared = false;
  let committed = false;
  try {
    await effects.markStaging();
    await effects.prepareStage();
    await effects.prepareRollback();
    await effects.markPrepared();
    prepared = true;
    await effects.closeLive();
    await effects.replaceLive();
    await effects.reopenAndValidate();
    await effects.markCommitted();
    committed = true;
  } catch (error) {
    try {
      if (prepared) await effects.restoreRollback();
      else await effects.cleanupUncommitted();
    } catch {
      // Recovery metadata is retained by the effect port. The caller must fail closed.
    }
    throw error;
  } finally {
    if (committed) await effects.cleanupCommitted().catch(() => undefined);
  }
}
