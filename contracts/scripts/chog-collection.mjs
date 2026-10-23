// Production deployment commands target Chog Genesis, regardless of legacy test env values.
// Preload before importing config so all deployment modules bind to the same collection.
process.env.FOUNDRY_COLLECTION = 'chog-genesis';
