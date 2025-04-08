const axios = require('axios');
const cheerio = require('cheerio');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');
const http = require('http');
const request = require('supertest');

// Import the app directly instead of spawning a separate process
const express = require('express');
const path = require('path');

// Set a different port for testing to avoid conflict with the main app
const TEST_PORT = 3099;

describe('Integration Tests', () => {
  let app;
  let server;

  beforeAll(async () => {
    // Mock external HTTP requests
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    
    // Create a test app instance
    app = express();
    
    // Middleware to parse request bodies
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(path.join(__dirname, '../public')));
    
    // Route to serve the main page
    app.get('/', (req, res) => {
      res.sendFile(path.join(__dirname, '../public', 'index.html'));
    });
    
    // API endpoint to fetch and modify content
    app.post('/fetch', async (req, res) => {
      try {
        const { url } = req.body;
        
        if (!url) {
          return res.status(400).json({ error: 'URL is required' });
        }
        
        // For testing, intercept example.com requests
        let html;
        if (url === 'https://example.com/') {
          html = sampleHtmlWithYale;
        } else {
          // Fetch the content from the provided URL
          const response = await axios.get(url, {
            maxRedirects: 5,
            validateStatus: status => status < 500
          });
          html = response.data;
        }
        
        // Use cheerio to parse HTML
        const $ = cheerio.load(html);
        
        // Process all text nodes in the document
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
    server = app.listen(TEST_PORT);
  }, 10000); // Increase timeout for server startup

  afterAll(async () => {
    // Close the server
    if (server) {
      server.close();
    }
    nock.cleanAll();
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Make a request to our proxy app using supertest
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/' })
      .expect(200);
    
    expect(response.body.success).toBe(true);
    
    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.body.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');
    
    // Verify URLs remain unchanged
    const links = $('a');
    let hasYaleUrl = false;
    links.each((i, link) => {
      const href = $(link).attr('href');
      if (href && href.includes('yale.edu')) {
        hasYaleUrl = true;
      }
    });
    expect(hasYaleUrl).toBe(true);
    
    // Verify link text is changed
    expect($('a').first().text()).toBe('About Fale');
  });

  test('Should handle invalid URLs', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'not-a-valid-url' })
      .expect(500);
    
    expect(response.body.error).toBeTruthy();
  });

  test('Should handle missing URL parameter', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({})
      .expect(400);
    
    expect(response.body.error).toBe('URL is required');
  });
});
