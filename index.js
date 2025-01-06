const express = require('express');
require('./jobs/cronJobs');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const indexRouter = require('./routes/index');
const uploadRoutes = require('./routes/upload.route');
const retrieveRoutes = require('./routes/retrieve.route');
const cors = require('cors');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));

const allowedOrigins = [
  'http://localhost:4200', 
  'http://localhost:8100', 
  'http://localhost/',
  'https://eventticketbookingdashboard.web.app'
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or Postman)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: Origin ${origin} is not allowed`));
    }
  },
  methods: ['PUT', 'GET', 'POST', 'DELETE'],
  allowedHeaders: ['X-Requested-With', 'Content-Type', 'Origin', 'Accept', 'Authorization'],
  exposedHeaders: ['Authorization'],
  credentials: true // Ensure this works only with specific origins
}));

// MongoDB Connection
const mongoURI = process.env.CONNECTIONSTRING;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Serve Frontend at /file
app.get('/file', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Routes
app.use('/file/upload', uploadRoutes);
app.use('/file/retrieve', retrieveRoutes);
app.use('/api', indexRouter);

// Cache-Control Middleware
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// 404 Error Handling
app.use((req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

// Start Server
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
