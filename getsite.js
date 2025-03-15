document.addEventListener('DOMContentLoaded', function () {
    const inputField = document.getElementById('url');
    const getButton = document.getElementById('getSite');

    // Extract the path from the URL
    const path = window.location.pathname.slice(1); // Remove the leading "/"
    if (path) {
        fetchWebsite(path);
    }

    getButton.addEventListener('click', () => {
        const url = inputField.value.trim();
        if (url) {
            // Update the browser's URL and reload the page
            window.location.href = `/${url}`;
        }
    });

    async function fetchWebsite(url) {
        console.log('Fetching website:', url);
        try {
            if (!url) {
                alert('Please enter a valid URL');
                return;
            }

            const validUrl = url.startsWith('http') ? url : `https://${url}`;
            let resultDiv = document.getElementById('site');
            if (!resultDiv) {
                resultDiv = document.createElement('div');
                resultDiv.id = 'site';
                document.body.appendChild(resultDiv);
            }

            resultDiv.innerHTML = 'Loading...';

            const response = await fetch(`https://api.cors.lol/?url=${encodeURIComponent(validUrl)}`, {
                method: 'GET'
            });

            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const data = await response.text();
            const parser = new DOMParser();
            const doc = parser.parseFromString(data, 'text/html');
            const base = new URL(validUrl);

            // Fix relative image sources
            const images = doc.querySelectorAll('img');
            images.forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http')) {
                    img.src = new URL(src, base).href;
                }
            });

            // Fix relative stylesheet links
            const links = doc.querySelectorAll('link[rel="stylesheet"]');
            links.forEach(link => {
                const href = link.getAttribute('href');
                if (href && !href.startsWith('http')) {
                    link.href = new URL(href, base).href;
                }
            });

            // Fix relative script sources
            const scripts = doc.querySelectorAll('script');
            scripts.forEach(script => {
                const src = script.getAttribute('src');
                if (src && !src.startsWith('http')) {
                    script.src = new URL(src, base).href;
                }
            });

            // Fix and transform anchor links
            const anchors = doc.querySelectorAll('a');
            anchors.forEach(anchor => {
                const href = anchor.getAttribute('href');
                if (!href || href.startsWith('#') || href.startsWith('javascript:')) {
                    return;
                }

                try {
                    const anchorUrl = new URL(href, base);
                    if (anchorUrl.hostname === base.hostname) {
                        const relativePath = anchorUrl.pathname + anchorUrl.search + anchorUrl.hash;
                        anchor.href = `${window.location.origin}/${anchorUrl.hostname}${relativePath}`;
                    } else {
                        anchor.href = `${window.location.origin}/${anchorUrl.hostname}${anchorUrl.pathname}${anchorUrl.search}${anchorUrl.hash}`;
                    }
                } catch (error) {
                    console.error(`Failed to process link: ${href}`, error);
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