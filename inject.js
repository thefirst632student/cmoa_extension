(function() {
    console.log("[CMOA inject.js] Loaded");
    
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
        const response = await originalFetch(...args);
        
        const clone = response.clone();
        const url = response.url;
        
        console.log("[CMOA inject.js] Fetch intercepted:", url.substring(0, 80));
        
        if (url.includes('bibGetCntntInfo.php')) {
            console.log("[CMOA inject.js] Matched bibGetCntntInfo");
            clone.json().then(data => {
                window.postMessage({
                    type: "CMOA_INFO",
                    url: url,
                    data: data
                }, "*");
            }).catch(e => {});
        } else if (url.includes('sbcGetCntnt.php')) {
            console.log("[CMOA inject.js] Matched sbcGetCntnt");
            clone.json().then(data => {
                window.postMessage({
                    type: "CMOA_CONTENT",
                    url: url,
                    data: data
                }, "*");
            }).catch(e => {});
        }
        
        return response;
    };

    const originalXHR = window.XMLHttpRequest.prototype.open;
    window.XMLHttpRequest.prototype.open = function(method, url) {
        console.log("[CMOA inject.js] XHR open:", url.substring(0, 80));
        this.addEventListener('load', function() {
            // Use responseURL (absolute) instead of url param (might be relative)
            const fullUrl = this.responseURL || url;
            if (fullUrl.includes('bibGetCntntInfo.php')) {
                console.log("[CMOA inject.js] XHR matched bibGetCntntInfo");
                try {
                    const data = JSON.parse(this.responseText);
                    window.postMessage({
                        type: "CMOA_INFO",
                        url: fullUrl,
                        data: data
                    }, "*");
                } catch(e) {}
            } else if (fullUrl.includes('sbcGetCntnt.php')) {
                console.log("[CMOA inject.js] XHR matched sbcGetCntnt");
                try {
                    const data = JSON.parse(this.responseText);
                    window.postMessage({
                        type: "CMOA_CONTENT",
                        url: fullUrl,
                        data: data
                    }, "*");
                } catch(e) {}
            }
        });
        originalXHR.apply(this, arguments);
    };
})();
