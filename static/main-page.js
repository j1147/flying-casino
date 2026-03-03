console.log('flying-casino has hit the browser');


const name_input = document.getElementById('name-input');

name_input.onkeydown = event => {
	switch (event.code) {
		case 'Enter':
			alert('this doesn\'t do anything yet');
			break;
	}
}