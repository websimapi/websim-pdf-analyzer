import * as pdfjs from 'pdfjs';
import 'pdfjs/build/pdf.worker';

// Set PDF.js worker source
pdfjs.GlobalWorkerOptions.workerSrc = 'pdfjs/build/pdf.worker';

// DOM elements
const fileInput = document.getElementById('pdf-upload');
const loadingElement = document.getElementById('loading');
const resultsElement = document.getElementById('results');
const pagesContainer = document.getElementById('pages-container');

// Conversation history for LLM
let conversationHistory = [];

// Listen for file upload
fileInput.addEventListener('change', handleFileUpload);

async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file || file.type !== 'application/pdf') {
        alert('Please upload a valid PDF file');
        return;
    }

    try {
        // Show loading state
        loadingElement.classList.remove('hidden');
        resultsElement.classList.add('hidden');
        pagesContainer.innerHTML = '';
        conversationHistory = [];

        // Read the PDF file
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        
        // Process each page
        for (let i = 1; i <= pdf.numPages; i++) {
            await processPage(pdf, i);
        }

        // Hide loading and show results
        loadingElement.classList.add('hidden');
        resultsElement.classList.remove('hidden');
    } catch (error) {
        console.error('Error processing PDF:', error);
        alert('Error processing PDF. Please try again.');
        loadingElement.classList.add('hidden');
    }
}

async function processPage(pdf, pageNumber) {
    // Get the page
    const page = await pdf.getPage(pageNumber);
    
    // Create a canvas to render the PDF page
    const viewport = page.getViewport({ scale: 1.5 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.height = viewport.height;
    canvas.width = viewport.width;

    // Render the PDF page to the canvas
    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;

    // Convert canvas to image data URL
    const imageDataUrl = canvas.toDataURL('image/png');
    
    // Create page element in the DOM
    const pageElement = createPageElement(pageNumber, imageDataUrl);
    pagesContainer.appendChild(pageElement);
    
    // Analyze the page using LLM
    const analysisElement = pageElement.querySelector('.page-analysis');
    analysisElement.textContent = 'Analyzing page content...';
    
    try {
        const analysis = await analyzePageImage(imageDataUrl, pageNumber);
        analysisElement.textContent = analysis;
    } catch (error) {
        console.error(`Error analyzing page ${pageNumber}:`, error);
        analysisElement.textContent = 'Error analyzing this page.';
    }
}

function createPageElement(pageNumber, imageDataUrl) {
    const pageElement = document.createElement('div');
    pageElement.className = 'page-card';
    pageElement.innerHTML = `
        <div class="page-header">
            <h3>Page ${pageNumber}</h3>
            <button class="page-toggle">▼</button>
        </div>
        <div class="page-content">
            <div class="page-image">
                <img src="${imageDataUrl}" alt="Page ${pageNumber}">
            </div>
            <div class="page-analysis">
                <h4>Analysis</h4>
                <p>Loading analysis...</p>
            </div>
        </div>
    `;

    // Add toggle functionality
    const toggleButton = pageElement.querySelector('.page-toggle');
    toggleButton.addEventListener('click', () => {
        pageElement.classList.toggle('collapsed');
        toggleButton.textContent = pageElement.classList.contains('collapsed') ? '▶' : '▼';
    });

    return pageElement;
}

async function analyzePageImage(imageDataUrl, pageNumber) {
    // Create a new message
    const newMessage = {
        role: "user",
        content: [
            {
                type: "text",
                text: `This is page ${pageNumber} of a PDF document. Please analyze this image in detail and describe everything you can see, including:
                - All text content (try to maintain original formatting and layout)
                - Any charts, graphs, or tables (describe their structure and content)
                - Any images or diagrams (describe what they depict)
                - Document structure, headers, footers, page numbers
                - Any other relevant information visible in this page
                
                Be as comprehensive and detailed as possible.`
            },
            {
                type: "image_url",
                image_url: { url: imageDataUrl }
            }
        ]
    };
    
    // Add to conversation history
    conversationHistory.push(newMessage);
    // Only keep the last 3 messages to avoid context limit issues
    conversationHistory = conversationHistory.slice(-3);
    
    // Send to LLM
    try {
        const completion = await websim.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: "You are a detailed document analysis assistant. Your task is to extract and explain as much information as possible from PDF page images, maintaining the formatting and describing all visual elements accurately."
                },
                ...conversationHistory
            ]
        });
        
        // Add response to conversation history
        conversationHistory.push(completion);
        
        return completion.content;
    } catch (error) {
        console.error('Error getting LLM response:', error);
        throw new Error('Failed to analyze the page content');
    }
}

