const app = require('./app');
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Financial Services Management System running on port ${PORT}`));
