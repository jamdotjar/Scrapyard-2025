document.addEventListener('DOMContentLoaded', function () {
    const inputField = document.getElementById('url');
    const getButton = document.getElementById('getSite');

    const path = window.location.pathname.slice(1);
    if (path) {
        fetchWebsite(path);
    }

    getButton.addEventListener('click', fetchWebsite);

    async function fetchWebsite() {
        try {
            const url = inputField.value.trim();

            if (!url) {
                alert('Please enter a valid URL');
                return;
            }

            // Make sure the URL has a protocol
            const validUrl = url.startsWith('http') ? url : `https://${url}`;

            // Create a div to display the result if it doesn't exist
            let resultDiv = document.getElementById('site');
            if (!resultDiv) {
                resultDiv = document.createElement('div');
                resultDiv.id = 'site';
                document.body.appendChild(resultDiv);
            }

            resultDiv.innerHTML = 'Loading...';

            // Fetch the website content
            const response = await fetch(`https://api.cors.lol/?url=${validUrl}`, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.text();

            // Create a temporary DOM to parse the fetched HTML
            const parser = new DOMParser();
            const doc = parser.parseFromString(data, 'text/html');

            // Update relative image sources to absolute URLs
            const images = doc.querySelectorAll('img');
            images.forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http')) {
                    img.src = new URL(src, validUrl).href;
                }
            });

            // Update relative stylesheet links to absolute URLs
            const links = doc.querySelectorAll('link[rel="stylesheet"]');
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http')) {
                    link.href = new URL(href, validUrl).href;
                }
            });

            // Inject only the body content into the result div
            resultDiv.innerHTML = '';
            const bodyContent = doc.body.cloneNode(true);
            resultDiv.appendChild(bodyContent);

        } catch (error) {
            console.error('Error fetching website:', error);
            alert(`Error: ${error.message}`);
        }
    }
});
