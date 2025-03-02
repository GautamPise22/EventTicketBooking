const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const path = require('path');
const methodOverride = require('method-override');
const indexRouter = require('./routes/index');
const uploadRoutes = require('./routes/upload.route');
const retrieveEnquiryRoutes = require('./routes/enquiryFileRetrieve.route');
const retrieveRoutes = require('./routes/retrieve.route');
const cors = require('cors');
require('./cronJobs');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const app = express();

// Middleware
app.use(cookieParser());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(methodOverride('_method'));

// CORS Configuration
const allowedOrigins = [
  'http://localhost:4200', 
  'http://localhost:8100', 
  'https://eventhorizondashboard.web.app',
  'https://localhost',
  'https://eventticketbooking-cy6o.onrender.com',
  "http://localhost:4000"
  
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl requests)
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['PUT', 'GET', 'POST', 'DELETE', 'PATCH'],
  allowedHeaders: ['X-Requested-With', 'Content-Type', 'Origin', 'Accept', 'Authorization'],
  exposedHeaders: ['Authorization'],
  credentials: true // This allows credentials to be included
}));


// MongoDB Connection
const mongoURI = process.env.CONNECTIONSTRING;
mongoose.connect(mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB connected successfully.'))
  .catch(err => console.error('MongoDB connection error:', err));

// Serve static files from "public"
//app.use('/file', express.static(path.join(__dirname, 'public')));

// Root route (`/`) does nothing
app.get('/', (req, res) => {
  res.status(204).send(); // No content
});

// Routes
app.use('/file/upload', uploadRoutes);
app.use('/file/retrieve/enquiryFile', retrieveEnquiryRoutes);
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
// Change this part in your index.js
const PORT = process.env.PORT || 4000;
if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}
