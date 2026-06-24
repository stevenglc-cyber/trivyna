const https = require('https');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const { action } = req.query;

  if (action === 'check_auth') {
    return res.status(200).json({
      logged_in: true,
      user_id: 'Vercel_Demo_User',
      is_wordpress: false,
      is_vercel: true
    });
  }

  if (action === 'get_history' || action === 'save_record') {
    // Instruct frontend to use client-side localStorage fallback since serverless is stateless
    return res.status(200).json({
      success: false,
      fallback_local: true,
      message: 'Vercel Serverless environment: using local browser storage'
    });
  }

  if (action === 'call_gemini') {
    let bodyData = '';
    
    // In Vercel, requests may come with pre-parsed body
    if (req.body) {
      bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } else {
      // If not parsed, read stream (fallback)
      bodyData = await new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => { resolve(JSON.parse(body || '{}')); });
      });
    }

    let apiKey = bodyData.api_key || process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        message: 'Missing Gemini API Key. Configure GEMINI_API_KEY in Vercel environment variables or enter it in the app.'
      });
    }

    const type = bodyData.type || 'analysis';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    let requestBody = {};
    if (type === 'vision') {
      let imageBase64 = bodyData.image_base64 || '';
      if (imageBase64.includes(',')) {
        imageBase64 = imageBase64.split(',')[1];
      }
      const prompt = bodyData.prompt || 'Identify food and calculate calories';
      requestBody = {
        contents: [{
          parts: [
            { text: prompt },
            { inlineData: { mimeType: 'image/jpeg', data: imageBase64 } }
          ]
        }]
      };
    } else {
      const prompt = bodyData.prompt || '';
      requestBody = {
        contents: [{
          parts: [{ text: prompt }]
        }]
      };
    }

    const postData = JSON.stringify(requestBody);

    try {
      const geminiResponse = await new Promise((resolve, reject) => {
        const geminiReq = https.request(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        }, (geminiRes) => {
          let data = '';
          geminiRes.on('data', chunk => { data += chunk; });
          geminiRes.on('end', () => {
            resolve({
              statusCode: geminiRes.statusCode,
              data: JSON.parse(data || '{}')
            });
          });
        });

        geminiReq.on('error', reject);
        geminiReq.write(postData);
        geminiReq.end();
      });

      return res.status(geminiResponse.statusCode).json(geminiResponse.data);

    } catch (error) {
      return res.status(500).json({
        success: false,
        message: 'Failed to proxy request to Gemini API: ' + error.message
      });
    }
  }

  return res.status(400).json({ success: false, message: 'Invalid action' });
};
