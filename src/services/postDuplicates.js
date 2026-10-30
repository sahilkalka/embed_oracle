// Database triggers cover every writer, including concurrent admin/cron requests.
// Existing articles are preserved; duplicate writes are rejected on future saves.
function installPostDuplicateGuards(db) {
  for (const operation of ['INSERT', 'UPDATE']) {
    const changed = operation === 'UPDATE'
      ? 'WHEN NEW.title IS NOT OLD.title OR NEW.contentMarkdown IS NOT OLD.contentMarkdown'
      : '';
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS prevent_duplicate_post_${operation.toLowerCase()}
      BEFORE ${operation} ON Post ${changed}
      BEGIN
        SELECT RAISE(ABORT, 'Duplicate post: a post with this title or content already exists')
        WHERE EXISTS (
          SELECT 1 FROM Post p WHERE p.id != NEW.id AND (
            lower(trim(p.title)) = lower(trim(NEW.title)) OR
            (length(trim(NEW.contentMarkdown)) > 0 AND trim(p.contentMarkdown) = trim(NEW.contentMarkdown))
          )
        );
      END;
    `);
  }
}

module.exports = { installPostDuplicateGuards };
