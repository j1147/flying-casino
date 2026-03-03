import express from 'express';
const app = express();

/** Parameters for the web server */
const config = {
	port: 8080,
	hostname: 'localhost'
};

/** Required to serve files via relative file paths. */
let __dirname;
__dirname ??= import.meta.dirname;
const options = {
	root: __dirname
};

// Listen for main page
app.get('/', (request, response) => {
	response.sendFile('./static/index.html', options, error => {
		if (error)
			console.error('could not send /static/index.html:', error);
	});
});

// Let all files in the static folder be accessed publicly
app.use('/static', express.static('static'));

app.listen(config.port, config.hostname, () => {
	console.log(`flying-casino is live at http://${config.hostname}:${config.port}`);
})