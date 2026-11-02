const prisma = require('./db');

const CACHE_TTL_MS = 30_000;
let cachedData = null;
let cacheExpiresAt = 0;
let pendingRequest = null;
let cacheGeneration = 0;

async function getHomepageData() {
  if (cachedData && Date.now() < cacheExpiresAt) {
    return cachedData;
  }

  const requestGeneration = cacheGeneration;
  if (!pendingRequest) {
    pendingRequest = Promise.all([
      prisma.post.findMany({
        where: { status: 'published' },
        orderBy: { publishedAt: 'desc' },
        take: 3,
        select: {
          id: true,
          title: true,
          slug: true,
          category: true,
          summary: true,
          coverImage: true,
          author: true,
          publishedAt: true,
          readingTime: true
        }
      }),
      prisma.testimonial.findMany({
        where: { isApproved: true },
        orderBy: { createdAt: 'desc' },
        take: 6
      })
    ]).then(([recentPosts, testimonials]) => ({ recentPosts, testimonials }));
  }

  const request = pendingRequest;
  try {
    const data = await request;
    if (cacheGeneration === requestGeneration && pendingRequest === request) {
      cachedData = data;
      cacheExpiresAt = Date.now() + CACHE_TTL_MS;
    }
    return data;
  } finally {
    if (pendingRequest === request) {
      pendingRequest = null;
    }
  }
}

function invalidateHomepageData() {
  cacheGeneration += 1;
  cachedData = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
}

module.exports = { getHomepageData, invalidateHomepageData };
