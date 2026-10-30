function parseFaqs(value) {
  const items = JSON.parse(value || '[]');
  if (!Array.isArray(items) || items.length > 100) throw new Error('Provide up to 100 FAQ entries.');
  return items.map(item => {
    if (!item || typeof item.question !== 'string' || typeof item.answer !== 'string') throw new Error('Each FAQ needs a question and answer.');
    const question = item.question.trim(), answer = item.answer.trim();
    if (!question || !answer || question.length > 300 || answer.length > 5000) throw new Error('FAQ questions require 1–300 characters and answers 1–5000 characters.');
    return { question, answer };
  });
}
module.exports = { parseFaqs };
