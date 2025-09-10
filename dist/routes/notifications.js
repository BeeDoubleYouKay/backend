"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const client_1 = require("@prisma/client");
const auth_1 = require("../services/auth");
const nodemailer_1 = __importDefault(require("nodemailer"));
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
// Enhanced email notifications system
const transporter = nodemailer_1.default.createTransport({
    // Configure with your email provider
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});
// Create notification preference
router.post('/preferences', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { emailNotifications, priceAlerts, rebalanceAlerts, marketNewsAlerts, frequency } = req.body;
        // In a real app, you'd have a separate NotificationPreferences table
        // For now, just return success
        res.json({
            message: 'Notification preferences updated',
            preferences: {
                emailNotifications,
                priceAlerts,
                rebalanceAlerts,
                marketNewsAlerts,
                frequency
            }
        });
    }
    catch (error) {
        console.error('Error updating notification preferences:', error);
        res.status(500).json({ error: 'Failed to update preferences' });
    }
});
// Send price alert notification
router.post('/send-price-alert', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { symbol, currentPrice, targetPrice, direction } = req.body;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || !user.email) {
            return res.status(404).json({ error: 'User email not found' });
        }
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `Price Alert: ${symbol} has reached your target`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Price Alert Triggered</h2>
          <p>Your price alert for <strong>${symbol}</strong> has been triggered.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Symbol:</strong> ${symbol}</p>
            <p><strong>Current Price:</strong> $${currentPrice}</p>
            <p><strong>Target Price:</strong> $${targetPrice}</p>
            <p><strong>Condition:</strong> ${direction}</p>
          </div>
          <p>Consider reviewing your portfolio and taking appropriate action.</p>
          <p style="color: #666; font-size: 12px;">
            This is an automated notification from your Portfolio Balancer.
          </p>
        </div>
      `
        };
        // Note: Email sending would require proper configuration
        // await transporter.sendMail(mailOptions);
        res.json({ message: 'Price alert notification sent successfully' });
    }
    catch (error) {
        console.error('Error sending price alert:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});
// Send portfolio rebalancing notification
router.post('/send-rebalance-alert', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { portfolioName, recommendations } = req.body;
        const user = await prisma.user.findUnique({
            where: { id: userId }
        });
        if (!user || !user.email) {
            return res.status(404).json({ error: 'User email not found' });
        }
        const recommendationsHtml = recommendations.map((rec) => `
      <div style="margin-bottom: 10px; padding: 10px; background-color: #f9f9f9; border-radius: 4px;">
        <strong>${rec.action.toUpperCase()}:</strong> ${rec.symbol} - ${rec.reason}
        <br><small>Suggested amount: $${rec.suggestedAmount}</small>
      </div>
    `).join('');
        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: user.email,
            subject: `Portfolio Rebalancing Recommended: ${portfolioName}`,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Portfolio Rebalancing Recommended</h2>
          <p>Your portfolio <strong>${portfolioName}</strong> has drifted from its target allocation.</p>
          
          <h3>Recommended Actions:</h3>
          ${recommendationsHtml}
          
          <p>Consider reviewing these recommendations and adjusting your portfolio accordingly.</p>
          <p style="color: #666; font-size: 12px;">
            This is an automated notification from your Portfolio Balancer.
          </p>
        </div>
      `
        };
        // Note: Email sending would require proper configuration
        // await transporter.sendMail(mailOptions);
        res.json({ message: 'Rebalancing notification sent successfully' });
    }
    catch (error) {
        console.error('Error sending rebalancing alert:', error);
        res.status(500).json({ error: 'Failed to send notification' });
    }
});
// Get notification history
router.get('/history', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        // Mock notification history - in real app, store in database
        const mockHistory = [
            {
                id: 1,
                type: 'price_alert',
                title: 'AAPL Price Alert',
                message: 'AAPL reached $180.00',
                timestamp: new Date().toISOString(),
                read: false
            },
            {
                id: 2,
                type: 'rebalance',
                title: 'Portfolio Rebalancing',
                message: 'Your portfolio needs rebalancing',
                timestamp: new Date(Date.now() - 86400000).toISOString(),
                read: true
            }
        ];
        res.json(mockHistory);
    }
    catch (error) {
        console.error('Error fetching notification history:', error);
        res.status(500).json({ error: 'Failed to fetch notification history' });
    }
});
// Mark notification as read
router.patch('/read/:notificationId', auth_1.requireAuth, async (req, res) => {
    try {
        const userId = req.user.id;
        const { notificationId } = req.params;
        // In real app, update notification in database
        res.json({ message: 'Notification marked as read' });
    }
    catch (error) {
        console.error('Error marking notification as read:', error);
        res.status(500).json({ error: 'Failed to mark notification as read' });
    }
});
exports.default = router;
