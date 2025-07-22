import jwt from 'jsonwebtoken';
export const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {

    const decodedPayload = jwt.verify(token, process.env.JWT_SECRET);

    
    req.user = decodedPayload;

    next();
  } catch (error) {

    res.status(400).json({ error: 'Invalid token.' });
  }
};