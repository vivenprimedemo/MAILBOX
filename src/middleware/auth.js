import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';

export const authenticateToken = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findOne({ id: decoded.userId, isActive: true });
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token or user not found'
      });
    }

    req.user = user;
    req.userId = user.id;
    next();
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({
        success: false,
        message: 'Invalid token'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Token verification failed'
    });
  }
};

export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findOne({ id: decoded.userId, isActive: true });
    
    if (user) {
      req.user = user;
      req.userId = user.id;
    }
    
    next();
  } catch (error) {
    // Continue without authentication
    next();
  }
};

export const requireEmailAccount = (req, res, next) => {
  const { accountId } = req.params;
  
  if (!req.user) {
    return res.status(401).json({
      success: false,
      message: 'Authentication required'
    });
  }

  const account = req.user.emailAccounts.find((acc) => acc.id === accountId);
  if (!account) {
    return res.status(404).json({
      success: false,
      message: 'Email account not found'
    });
  }

  if (!account.isActive) {
    return res.status(403).json({
      success: false,
      message: 'Email account is disabled'
    });
  }

  req.emailAccount = account;
  next();
};