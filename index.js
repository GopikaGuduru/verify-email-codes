// Example Appwrite Cloud Function for sending email verification codes
// index.js

const sdk = require('node-appwrite');
const nodemailer = require('nodemailer'); // Using Nodemailer for email sending

/*
  'req' variable has:
    'headers' - object with request headers
    'payload' - request body data as a string
    'variables' - object with function variables

  'res' variable has:
    'send(text, status)' - function to return text response. Status code defaults to 200
    'json(obj, status)' - function to return JSON response. Status code defaults to 200
  
  If an error is thrown, a response with code 500 will be returned.
*/

// In-memory storage for verification codes (in production, use a database)
// This is just for demonstration - in a real app, you would use a database
const verificationCodes = {};

module.exports = async function(req, res) {
  // Initialize the Appwrite SDK
  const client = new sdk.Client();
  
  // Get required variables
  const apiKey = req.variables['APPWRITE_API_KEY'];
  const emailHost = req.variables['EMAIL_HOST'];
  const emailPort = req.variables['EMAIL_PORT'];
  const emailUser = req.variables['EMAIL_USER'];
  const emailPass = req.variables['EMAIL_PASS'];
  const emailFrom = req.variables['EMAIL_FROM'];
  
  if (!apiKey || !emailHost || !emailPort || !emailUser || !emailPass || !emailFrom) {
    return res.json({
      success: false,
      message: 'Missing required environment variables'
    }, 500);
  }
  
  // Set up the Appwrite client
  client
    .setEndpoint('https://cloud.appwrite.io/v1')
    .setProject(req.variables['APPWRITE_FUNCTION_PROJECT_ID'])
    .setKey(apiKey);
    
  // Parse the incoming request
  let payload;
  try {
    payload = JSON.parse(req.payload);
  } catch (e) {
    return res.json({
      success: false,
      message: 'Invalid payload format'
    }, 400);
  }
  
  // Determine which operation to perform: send or verify
  const operation = req.variables['APPWRITE_FUNCTION_NAME'];
  
  if (operation === 'send-email-verification') {
    return await sendVerificationEmail(payload, res, {
      emailHost, emailPort, emailUser, emailPass, emailFrom
    });
  } else if (operation === 'verify-email-code') {
    return await verifyEmailCode(payload, res);
  } else {
    return res.json({
      success: false,
      message: 'Unknown operation'
    }, 400);
  }
};

// Function to send verification email
async function sendVerificationEmail(payload, res, emailConfig) {
  const { email, code } = payload;
  
  if (!email) {
    return res.json({
      success: false,
      message: 'Missing required field: email'
    }, 400);
  }
  
  // If no code is provided, generate a random 6-digit code
  const verificationCode = code || Math.floor(100000 + Math.random() * 900000).toString();
  
  // Store the code (in a real app, you would store in a database with expiration)
  verificationCodes[email] = {
    code: verificationCode,
    createdAt: new Date().getTime(),
    // Expires in 10 minutes
    expiresAt: new Date().getTime() + (10 * 60 * 1000)
  };
  
  // Create the email transporter
  const transporter = nodemailer.createTransport({
    host: emailConfig.emailHost,
    port: parseInt(emailConfig.emailPort),
    secure: parseInt(emailConfig.emailPort) === 465, // true for 465, false for other ports
    auth: {
      user: emailConfig.emailUser,
      pass: emailConfig.emailPass
    }
  });
  
  // Email content
  const mailOptions = {
    from: emailConfig.emailFrom,
    to: email,
    subject: 'Your Verification Code',
    text: `Your verification code is: ${verificationCode}. This code will expire in 10 minutes.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 5px;">
        <h2 style="color: #333;">Email Verification</h2>
        <p style="color: #666; font-size: 16px;">Your verification code is:</p>
        <div style="background-color: #f5f5f5; padding: 10px; border-radius: 4px; text-align: center; font-size: 24px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
          ${verificationCode}
        </div>
        <p style="color: #666; font-size: 14px;">This code will expire in 10 minutes.</p>
        <p style="color: #888; font-size: 12px; margin-top: 30px;">If you didn't request this verification, please ignore this email.</p>
      </div>
    `
  };
  
  try {
    // Send the email
    await transporter.sendMail(mailOptions);
    
    return res.json({
      success: true,
      message: 'Verification code sent successfully'
    });
  } catch (error) {
    console.error('Email sending error:', error);
    
    return res.json({
      success: false,
      message: `Failed to send verification email: ${error.message}`
    }, 500);
  }
}

// Function to verify email code
async function verifyEmailCode(payload, res) {
  const { email, code } = payload;
  
  if (!email || !code) {
    return res.json({
      success: false,
      message: 'Missing required fields: email and code'
    }, 400);
  }
  
  // Check if we have a verification code for this email
  if (!verificationCodes[email]) {
    return res.json({
      success: false,
      verified: false,
      message: 'No verification code found for this email'
    }, 400);
  }
  
  const storedVerification = verificationCodes[email];
  
  // Check if the code has expired
  if (storedVerification.expiresAt < new Date().getTime()) {
    // Clean up expired code
    delete verificationCodes[email];
    
    return res.json({
      success: false,
      verified: false,
      message: 'Verification code has expired'
    }, 400);
  }
  
  // Check if the code matches
  if (storedVerification.code !== code) {
    return res.json({
      success: false,
      verified: false,
      message: 'Invalid verification code'
    }, 400);
  }
  
  // Code is valid, clean up after successful verification
  delete verificationCodes[email];
  
  return res.json({
    success: true,
    verified: true,
    message: 'Email verified successfully'
  });
}
