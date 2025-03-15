document.addEventListener('DOMContentLoaded', function () {
    const inputField = document.getElementById('url');
    const getButton = document.getElementById('getSite');

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
            let resultDiv = document.getElementById('result');
            if (!resultDiv) {
                resultDiv = document.createElement('div');
                resultDiv.id = 'result';
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

            // Display the rendered HTML
            resultDiv.innerHTML = '';

            // Create an iframe to display the rendered HTML
            const iframe = document.createElement('iframe');
            iframe.style.width = '100%';
            iframe.style.height = '600px';
            iframe.style.border = '1px solid #ddd';
            resultDiv.appendChild(iframe);

            // Write the HTML content to the iframe
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            iframeDoc.open();
            iframeDoc.write(data);
            iframeDoc.close();

        } catch (error) {
            console.error('Error fetching website:', error);
            alert(`Error: ${error.message}`);
        }
    }
});
