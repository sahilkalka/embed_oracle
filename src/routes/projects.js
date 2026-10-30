// src/routes/projects.js
const express = require('express');
const router = express.Router();
const prisma = require('../services/db');

// GET /projects - Filterable Portfolio
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;

    const where = {};
    if (category && category !== 'All') {
      where.category = category;
    }
    if (search && search.trim()) {
      where.OR = [
        { title: { contains: search.trim() } },
        { summary: { contains: search.trim() } },
        { techStack: { contains: search.trim() } },
        { industry: { contains: search.trim() } }
      ];
    }

    const projects = await prisma.project.findMany({
      where,
      orderBy: [
        { featured: 'desc' },
        { order: 'asc' },
        { createdAt: 'desc' }
      ]
    });

    // Categories list for pills
    const allProjects = await prisma.project.findMany({ select: { category: true } });
    const categories = ['All', ...new Set(allProjects.map(p => p.category).filter(Boolean))];

    res.locals.seo.title = 'Engineering Projects & Case Studies - Embedded India';
    res.locals.seo.description = 'Explore our portfolio of industrial embedded systems, automotive CAN-FD controllers, smart CleanTech dispensers, and IoT gateways.';
    res.locals.seo.canonical = `${res.locals.appUrl}/projects`;

    res.render('pages/projects', {
      projects,
      categories,
      selectedCategory: category || 'All',
      searchQuery: search || ''
    });
  } catch (err) {
    console.error('[PROJECTS ROUTE ERROR]', err);
    res.render('pages/projects', {
      projects: [],
      categories: ['All'],
      selectedCategory: 'All',
      searchQuery: ''
    });
  }
});

// GET /projects/:slug - Detailed Case Study
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const project = await prisma.project.findUnique({
      where: { slug }
    });

    if (!project) {
      return next(); // Delegate to 404 handler
    }

    // Related projects in same category
    const relatedProjects = await prisma.project.findMany({
      where: {
        category: project.category,
        slug: { not: project.slug }
      },
      take: 2
    });

    // Parse specs JSON safely
    let specsObj = {};
    try {
      if (project.specs) specsObj = JSON.parse(project.specs);
    } catch (e) {}

    // Parse metrics JSON safely
    let metricsArr = [];
    try {
      if (project.metrics) metricsArr = JSON.parse(project.metrics);
    } catch (e) {}

    res.locals.seo.title = `${project.title} - Engineering Case Study | Embedded India`;
    res.locals.seo.description = project.summary;
    res.locals.seo.canonical = `${res.locals.appUrl}/projects/${project.slug}`;

    res.render('pages/project-detail', {
      project,
      specs: specsObj,
      metrics: metricsArr,
      relatedProjects
    });
  } catch (err) {
    console.error('[PROJECT DETAIL ERROR]', err);
    next(err);
  }
});

module.exports = router;
