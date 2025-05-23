const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const app = express();
const PORT = 3001;

// Middleware to parse request bodies
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Route to serve the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API endpoint to fetch and modify content
app.post('/fetch', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Fetch the content from the provided URL
    const response = await axios.get(url, {
      // Prevent circular references in response
      maxRedirects: 5,
      validateStatus: status => status < 500
    });
    const html = response.data;

    // Use cheerio to parse HTML and selectively replace text content, not URLs
    const $ = cheerio.load(html);
    
        // Process all text nodes in the document (including title and other elements)
    const processTextNodes = (node) => {
      if (node.type === 'text') {
        // Replace Yale with Fale in text content
        const newText = node.data
          .replace(/Yale/g, 'Fale')
          .replace(/yale/g, 'fale')
          .replace(/YALE/g, 'FALE');
        node.data = newText;
      }
    };

    // Process all elements to replace text content
    const walkNodes = (parentNode) => {
      // Process all child nodes
      $(parentNode).contents().each((i, node) => {
        // Process text nodes
        if (node.type === 'text') {
          processTextNodes(node);
        }
        // Recursively process child elements
        else if (node.type === 'tag') {
          walkNodes(node);
        }
      });
    };

    // Walk the entire document
    walkNodes($.root()[0]);
    
    // Process title separately to ensure it's captured
    const title = $('title').text().replace(/Yale/g, 'Fale').replace(/yale/g, 'fale').replace(/YALE/g, 'FALE');
    $('title').text(title);
    
    // Process link text but preserve URLs
    $('a').each(function() {
      const linkText = $(this).text();
      $(this).text(linkText.replace(/Yale/g, 'Fale').replace(/yale/g, 'fale').replace(/YALE/g, 'FALE'));
    });
    
    return res.json({ 
      success: true, 
      content: $.html(),
      title: title,
      originalUrl: url
    });
  } catch (error) {
    console.error('Error fetching URL:', error.message);
    return res.status(500).json({ 
      error: `Failed to fetch content: ${error.message}` 
    });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Faleproxy server running at http://localhost:${PORT}`);
});
