Online card gaming site.
Requires node.js to run.

Current structure:
```
static:						will probably host most of the files
	|- index.html:			main page
	|- main-page.js:		code for main page
	network:
		|- network.html:	test datachannel site
		|- network.js:		main networking api
webserver.js:				hosts website
server.py:					debug datachannel server
```

Before running the project, navigate to the root directory and run
```
npm install
```

** Please don't upload your node-modules folder! Delete it before adding changes! **

Currently, the main file is `webserver.js`, but this may change.
You can run the webserver by doing
```
node webserver.js
```
in your terminal of choice. Default host is at `http://localhost:8080`.

May also require running `server.py` with Python.
