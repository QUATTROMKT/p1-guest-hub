const fetch = require('node-fetch');

async function checkStatus() {
    try {
        const res = await fetch('https://api.z-api.io/instances/3EDDA716EC1BF3F118711AC0A90830D6/token/2CA5B27FD7E8EA7872F88116/status', {
            headers: { 'Client-Token': 'Fba70686a73f5409da3e0f33bfee5a190S' }
        });
        const data = await res.json();
        console.log(JSON.stringify(data, null, 2));
    } catch (e) {
        console.error(e);
    }
}
checkStatus();
