const prisma = require('../src/services/db');

async function mergeStats() {
  const stats = await prisma.calculatorStat.findMany();
  const map = {};
  for (const s of stats) {
    const key = (s.toolName || '').toLowerCase().trim();
    if (!key) continue;
    if (!map[key]) {
      map[key] = { keepId: s.id, totalCount: 0, deleteIds: [] };
    } else {
      map[key].deleteIds.push(s.id);
    }
    map[key].totalCount += s.executionCount || 0;
  }

  for (const key of Object.keys(map)) {
    const item = map[key];
    await prisma.calculatorStat.update({
      where: { id: item.keepId },
      data: { toolName: key, executionCount: item.totalCount }
    });
    for (const delId of item.deleteIds) {
      await prisma.calculatorStat.delete({ where: { id: delId } });
    }
  }

  const clean = await prisma.calculatorStat.findMany({ orderBy: { executionCount: 'desc' } });
  console.log('Cleaned calculator stats count:', clean.length);
  console.log(clean);
  process.exit(0);
}

mergeStats().catch(err => {
  console.error(err);
  process.exit(1);
});

