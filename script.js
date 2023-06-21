const COORD_GPS = 8307;
const COORD_WAW = 2178;
const EPSG2178 = '+proj=tmerc +lat_0=0 +lon_0=21 +k=0.999923 +x_0=7500000 +y_0=0 +ellps=GRS80 +units=m +no_defs';

// let proj4, MVMapView, MVMapTileLayer, MVSdoGeometry, MVMapDecoration, MVScaleBar, MVThemeBasedFOI, MVEvent, MVFOI;

//////////////////////////////////////////////////////////////////////////////

const UIMap = {

	mapview: undefined,
	treesLayer: undefined,
	_mapVector: undefined,
	_mapOrto: undefined,

	show: function() {
		MVMapView.enableCodingHints(false);
		const mapview = new MVMapView(document.getElementById('map'), 'https://mapa.um.warszawa.pl/mapviewer');

		mapview.addCopyRightNote('Mapa i dane &copy; Urząd m.st. Warszawy');

		const tiles = 'https://mapa.um.warszawa.pl/mapviewer/mcserver';
		this._mapVector = new MVMapTileLayer('dane_wawa.SZYBKA_PODKLAD_WEKTOR', tiles);
		this._mapOrto = new MVMapTileLayer('dane_wawa.SZYBKA_PODKLAD_ORTO', tiles);
		mapview.addMapTileLayer(this._mapVector);
		mapview.addMapTileLayer(this._mapOrto);
		this._mapVector.setVisible(false);

		mapview.setCenter(MVSdoGeometry.createPoint(21.00330, 52.22878, COORD_GPS));
		mapview.setZoomLevel(19);
		mapview.addNavigationPanel('WEST', false);
		mapview.addMapDecoration(new MVMapDecoration(new MVScaleBar({format:'METRIC'}), 0, 1, null, null, 10, -20));

		mapview.display();

		this.mapview = mapview;

		this.treesLayer = this._getTreesLayer();
		this.mapview.addThemeBasedFOI(this.treesLayer);
	},

	_getTreesLayer: function() {
		const poi = new MVThemeBasedFOI('poi', 'dane_wawa.BOS_ZIELEN_DRZEWA', 'https://mapa.um.warszawa.pl/mapviewer/foi');
		poi.setMinVisibleZoomLevel(17);
		poi.setMaxWholeImageLevel(19);
		poi.setMouseCursorStyle('pointer');
		poi.setClickable(true);
		return poi;
	},

	showVectorLayer: function() {
		const root = document.querySelector(':root');
		this._mapVector.setVisible(true);
		this._mapOrto.setVisible(false);
		root.style.setProperty('--copy', 'black');
	},

	showOrtoLayer: function() {
		const root = document.querySelector(':root');
		this._mapVector.setVisible(false);
		this._mapOrto.setVisible(true);
		root.style.setProperty('--copy', 'white');
	},

};

//////////////////////////////////////////////////////////////////////////////

const TreeLabels = {

	_labels: [],
	_foiLabels: new Set(),
	data: [],

	start: function() {
		UIMap.mapview.attachEventListener(MVEvent.ZOOM_LEVEL_CHANGE, this._zooming.bind(this));
		UIMap.treesLayer.attachEventListener(MVEvent.AFTER_REFRESH, this._dataLoaded.bind(this));
	},

	_zooming: function(prevZoom, newZoom) {
		// console.log(newZoom);
		const LIMIT = 17;
		if (prevZoom < LIMIT && newZoom >= LIMIT) {
			for (const label of this._labels)
				label.setVisible(true);
		} else if (prevZoom >= LIMIT && newZoom < LIMIT) {
			for (const label of this._labels)
				label.setVisible(false);
		}
	},

	_dataLoaded: function() {
		this.data = UIMap.treesLayer.getFOIData();
		if (!this.data) return;

		for (const el of this.data) {

			const m = el.name.match(/^Nazwa polska: (.+)/m);
			if (!m)
				continue;
			const text = m[1].replace(/["']/g, '');
			if (text.startsWith('**'))
				continue;

			el.originalName = el.name;
			el.name = text;

			if (this._foiLabels.has(el.id))
				continue;
			this._foiLabels.add(el.id);

			const parts = text.split(' ');
			const text2 = parts.length == 1 ? text.substring(0, 3) : parts[0].substring(0, 3) + ' ' + parts[1].substring(0, 3);
			const html = `<span class="label">${text2}</span>`;
			const loc = MVSdoGeometry.createPoint(el.x, el.y, COORD_WAW);
			const label = MVFOI.createHTMLFOI(el.id, loc, html, 10, 0);
			UIMap.mapview.addFOI(label);
			this._labels.push(label);
		}
	},

};

//////////////////////////////////////////////////////////////////////////////

const UI = {

	autoRefresh: true,

	setLayerVisible: function(checkBox) {
		if (checkBox.checked)
			UIMap.showOrtoLayer();
		else
			UIMap.showVectorLayer();
	},
};

//////////////////////////////////////////////////////////////////////////////

const TreeSelector = {

	_selectedTreeMarker: undefined,
	_thisYear: new Date().getFullYear(),

	start: function() {
		const that = this;
		UIMap.treesLayer.attachEventListener(MVEvent.MOUSE_CLICK, (_, x) => this.selectTree(x));
	},

	selectTree: function(x) {
		// alert(x);
		// console.log(x);
		const originalName = x.originalName;
		let name, data;
		try {
			name = originalName.match(/^Nazwa polska: (.+)/m)[1];
			data = '';

			let m = originalName.match(/^Wysokość w m: (\d+)/m);
			if (m) {
				const height = +m[1];
				data = `h ${height} m`;
			}

			m = originalName.match(/^Obwód pnia w cm: (\d+)/m);
			if (m) {
				const diameter = Math.round(+m[1] / 3.14);
				if (data) data += ', ';
				data += `𝝓 ${diameter} cm`;
			}

			m = originalName.match(/^Aktualność danych.*?(\d{4})/m);
			if (m) {
				const yearsAgo = this._thisYear - +m[1];
				let data1;
				if (yearsAgo === 0)
					data1 = 'z tego roku';
				else if (yearsAgo === 1)
					data1 = 'rok temu';
				else if (yearsAgo <= 4)
					data1 = `${yearsAgo} lata temu`;
				else
					data1 = `${yearsAgo} lat temu`;

				if (data)
					data = `${data1}, ${data}`;
				else
					data = data1;
			}

		} catch (e) {
			console.log(e);
			name = originalName;
		}
		document.getElementById('footer-name').innerText = name;
		document.getElementById('footer-data').innerText = data;

		const loc = MVSdoGeometry.createPoint(x.x, x.y, COORD_WAW);
		if (!this._selectedTreeMarker) {
			this._selectedTreeMarker = MVFOI.createHTMLFOI('selected-tree', loc, '<div class="tree-marker"></div>', -10, -10);
			UIMap.mapview.addFOI(this._selectedTreeMarker);
			UIMap.mapview.setCenter(loc);
		} else
			this._selectedTreeMarker.updateGeometry(loc);
	},
};

//////////////////////////////////////////////////////////////////////////////

const UserLocation = {

	_userMarker: undefined,

	start: function() {
		if (navigator.geolocation) {
			// navigator.geolocation.watchPosition(userLocation, userLocationError, {
			// 	enableHighAccuracy: true,
			// 	timeout: 5000,
			// });
			const loc = () => {
				if (UI.autoRefresh)
					navigator.geolocation.getCurrentPosition(this._userLocation, this._userLocationError, { enableHighAccuracy: true });
			};
			setInterval(() => loc(), 5000);
			loc();
		}
	},

	_userLocation: function(position) {
		const loc = MVSdoGeometry.createPoint(position.coords.longitude, position.coords.latitude, COORD_GPS);
		if (!this._userMarker) {
			this._userMarker = MVFOI.createMarkerFOI('user-loc', loc, 'marker.png', 25, 82);
			UIMap.mapview.addFOI(this._userMarker);
			UIMap.mapview.setCenter(loc);
		} else {
			this._userMarker.animateToNewLocation(loc);
			UIMap.mapview.setCenter(loc);
		}

		if (!TreeLabels.data)
			return;

		const res = proj4(EPSG2178, [position.coords.longitude, position.coords.latitude]);
		// console.log('loc', res);
		let leastDist = -1, leastItem;
		for (const item of TreeLabels.data) {
			const dist = (res[0] - item.x) * (res[0] - item.x) + (res[1] - item.y) * (res[1] - item.y);
			if (leastDist === -1 || dist < leastDist) {
				leastDist = dist;
				leastItem = item;
			}
			// console.log('item', [item.x, item.y]);
		}
		if (leastItem)
			TreeSelector.selectTree(leastItem);
	},

	userLocationError: function(err) {
		console.error(`ERROR (${err.code}): ${err.message}`);
	},
};

//////////////////////////////////////////////////////////////////////////////

const FixTouch = {

	_touchDownTime: new Date().getTime(),

	fix: function() {
		document.addEventListener('touchstart', this._touchHandler, true);
		document.addEventListener('touchmove', this._touchHandler, true);
		document.addEventListener('touchend', this._touchHandler, true);
		document.addEventListener('touchcancel', this._touchHandler, true);
	},

	_touchHandler: function(event) {
		const touches = event.changedTouches,
			first = touches[0];
		let type = '';
		switch(event.type) {
			case 'touchstart': type = 'mousedown'; break;
			case 'touchmove':  type = 'mousemove'; break;
			case 'touchend':   type = 'mouseup';   break;
			default:           return;
		}

		if (type === 'mouseup') {
			const touchUpTime = new Date().getTime();
			if (touchUpTime - this._touchDownTime < 500) {
				// type = 'click';
			}
		} else if (type === 'mousedown')
			this._touchDownTime = new Date().getTime();

		// initMouseEvent(type, canBubble, cancelable, view, clickCount,
		//                screenX, screenY, clientX, clientY, ctrlKey,
		//                altKey, shiftKey, metaKey, button, relatedTarget);

		const simulatedEvent = document.createEvent('MouseEvent');
		simulatedEvent.initMouseEvent(
			type, true, true, window, 1,
			first.screenX, first.screenY,
			first.clientX, first.clientY, false,
			false, false, false, 0/*left*/, null
		);

		first.target.dispatchEvent(simulatedEvent);
		event.preventDefault();
	},

};

//////////////////////////////////////////////////////////////////////////////

UIMap.show();
TreeLabels.start();
TreeSelector.start();
UserLocation.start();
// FixTouch.fix();
