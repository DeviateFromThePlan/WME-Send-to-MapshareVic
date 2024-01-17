// ==UserScript==
// @name         WME Send to AU GovMap
// @namespace    https://github.com/DeviateFromThePlan/WME-Send-to-AU-GovMap
// @version      2024.01.17.01
// @description  Opens your government's map to the coordinates currently in WME.
// @author       DeviateFromThePlan, maporaptor & lacmacca
// @license      MIT
// @match        *://*.waze.com/*editor*
// @match        https://qldglobe.information.qld.gov.au*
// @exclude      *://*.waze.com/user/editor*
// @grant        none
// @require      https://cdnjs.cloudflare.com/ajax/libs/proj4js/2.7.5/proj4.js
// @require      https://greasyfork.org/scripts/24851-wazewrap/code/WazeWrap.js
// @downloadURL  https://github.com/DeviateFromThePlan/WME-Send-to-AU-GovMap/releases/latest/download/WME-Send-to-AU-GovMap.user.js
// @updateURL    https://github.com/DeviateFromThePlan/WME-Send-to-AU-GovMap/releases/latest/download/WME-Send-to-AU-GovMap.user.js
// ==/UserScript==

/* global W */
/* global WazeWrap */
/* global proj4 */

(function () {
    'use strict';

    const SCRIPT_NAME = GM_info.script.name;
    const SCRIPT_VERSION = GM_info.script.version;
    const DOWNLOAD_URL = 'https://github.com/DeviateFromThePlan/WME-Send-to-AU-GovMap/releases/latest/download/WME-Send-to-AU-GovMap.user.js';
    const UPDATE_NOTES = 'Added support for SA & NSW; Added an option to trigger script with the G-key, rather than the button; Renamed to WME Send to AU GovMap';
    
    if (document.URL.includes('https://qldglobe.information.qld.gov.au/')) {
        //INSERT QLDGLOBE CODE HERE
    } else {
        const WGS_84 = '+proj=longlat +ellps=WGS84 +datum=WGS84 +no_defs';
        const VIC_GRID_94 = '+proj=tmerc +lat_0=-37 +lon_0=145 +k=1 +x_0=2500000 +y_0=2500000 +ellps=GRS80 +units=m +no_defs';
        let SEGMENT_COUNT = 0;
        let ACTIONS_LOADED = 0;
        let GOVMAP_GKEY_ENABLED = false;
        let NEEDED_PARAMS = {
            WMESTDCountry: '',
            WMESTDState: '',
            WMESTDServer: '',
        };
        
        function bootstrap() {
            if (typeof W === 'object' && W.userscripts?.state.isReady && WazeWrap.Interface) {
                init();
            } else {
                document.addEventListener('wme-ready', init, {
                    once: true,
                });
            }
        }

        function init() {
            log_debug('Initialising');

            try {
                let updateMonitor = new WazeWrap.Alerts.ScriptUpdateMonitor(SCRIPT_NAME, SCRIPT_VERSION, DOWNLOAD_URL, GM_xmlhttpRequest);
                updateMonitor.start();
            } catch (ex) {
                // Report, but don't stop if ScriptUpdateMonitor fails.
                log_error(ex.message)
            }

            // Settings tab
            let tabElement = document.createElement('div');
            tabElement.innerHTML = ['<h4>WME Send to AU GovMap</h4>', '<h6>Controls</h6>', '<form id="controls" name="controls">', '<input type="checkbox" id="govmapGKey" name="govmapGKey" value="true"/> G Key', '</form>'].join('');
            WazeWrap.Interface.Tab('GovMap', tabElement.innerHTML, function () {});

            $('#govmapGKey').change(function () {
                GOVMAP_GKEY_ENABLED = this.checked;
                log_debug('G-Key control ' + GOVMAP_GKEY_ENABLED);
            });

            // Footer button
            let mapLinkElement = document.createElement('a');
            mapLinkElement.id = 'WME-showState';
            mapLinkElement.classList.add('wz-map-black-link');
            mapLinkElement.innerText = '🇦🇺 GovMap';
            mapLinkElement.onclick = getMapLink;

            let mousePositionElement = document.getElementsByClassName('wz-map-ol-control-mouse-position')[0];
            mousePositionElement.parentNode.insertBefore(mapLinkElement, mousePositionElement.nextSibling);
            
            document.addEventListener('keydown', (event) => {
                // Check if the mouse is over the map area
                // You may need to adjust the selector based on the Waze Map Editor structure
                if (GOVMAP_GKEY_ENABLED && event.key.toLowerCase() === 'g' && document.querySelector('#WazeMap:hover')) {
                    getMapLink();
                }
            });

            WazeWrap.Interface.ShowScriptUpdate(SCRIPT_NAME, SCRIPT_VERSION, UPDATE_NOTES, '');
        }

        function getMapLink() {
            let country = W.model.getTopCountry();
            let state = W.model.getTopState();

            // Check compatability
            if (country.getName() !== 'Australia') {
                return WazeWrap.Alerts.warning(SCRIPT_NAME, "Sorry but we currently don't support loading maps from other countries but Australia.");
            }
            
            if (W.map.getZoom() < 12) {
                return WazeWrap.Alerts.warning(SCRIPT_NAME, 'Please Zoom in to at least Level 12.');
            }
            
            if (!state.getName() || state.getName() === '') {
                return WazeWrap.Alerts.warning(SCRIPT_NAME, 'Please move closer to land.');
            }
            
            switch (state.getName()) {
                case 'Victoria':
                    return openMapshareVic();
                case 'South Australia':
                    return openLocationSAViewer();
                case 'New South Wales':
                    return openGisNSW();
                default:
                    return WazeWrap.Alerts.warning(SCRIPT_NAME, "Sorry but we currently don't support loading maps from " + state.getName() + '.');
            }
        }

        ////////////////
        //  VICTORIA  //
        ////////////////
        function openMapshareVic() {
            let { lon, lat } = getWazeCenterCoords();

            if (isNaN(lat) || isNaN(lon)) {
                log_debug('Invalid coordinates');
                return false;
            }

            let [x, y] = proj4(WGS_84, VIC_GRID_94, [lon, lat]);
            let scaleMin = 976.5644531289063;
            let scaleMax = 8000016.000032;
            let scale = scaleMax;
            let wazeZoom = W.map.getZoom();

            if (wazeZoom <= 5) {
                scale = scaleMax;
            } else if (wazeZoom >= 20) {
                scale = scaleMin;
            }
            
            for (let i = 6; i < wazeZoom; i++) {
                scale /= 2;
            }
            
            const mapURL = `https://mapshare.vic.gov.au/mapsharevic/?scale=${scale}&center=${x}%2C${y}`;
            window.open(mapURL, '_blank');

            //Prevent default 'a' tag functionality
            return false;
        }

        ///////////////////////
        //  SOUTH AUSTRALIA  //
        ///////////////////////
        function openLocationSAViewer() {
            let { lon, lat } = getWazeCenterCoords();

            if (isNaN(lat) || isNaN(lon)) {
                log_debug('Invalid coordinates');
                return false;
            }

            let wazeZoom = W.map.getZoom();
            let scale = null;

            if (wazeZoom >= 6) {
                scale = wazeZoom;
            }

            const mapURL = `https://location.sa.gov.au/viewer/?map=hybrid&x=${lon}&y=${lat}&z=${scale}`;
            window.open(mapURL, '_blank');

            //Prevent default 'a' tag functionality
            return false;
        }

        /////////////////////
        // NEW SOUTH WALES //
        /////////////////////
        function openGisNSW() {
            let { lon, lat } = getWazeCenterCoords();

            const mapURL = `https://www.arcgis.com/home/webmap/viewer.html?basemapUrl=http%3A%2F%2Fmaps.six.nsw.gov.au%2Farcgis%2Frest%2Fservices%2Fpublic%2FNSW_Base_Map%2FMapServer&find=${lon},${lat}`;
            window.open(mapURL, '_blank');

            //Prevent default 'a' tag functionality
            return false;
        }

        function getWazeCenterCoords() {
            let { lon: wazeLon, lat: wazeLat } = W.map.getCenter();
            const { lon, lat } = WazeWrap.Geometry.ConvertTo4326(wazeLon, wazeLat);
            return roundCoordinates(lon, lat);
        }

        function roundCoordinates(longitude, latitude, decimalPlaces = 4) {
            return {lon: parseFloat(longitude.toFixed(decimalPlaces)), lat: parseFloat(latitude.toFixed(decimalPlaces))};
        }

        function log_debug(message) {
            console.log(`${SCRIPT_NAME}: ${message}`);
        }

        function log_error(message) {
            console.error(`${SCRIPT_NAME}: ${message}`);
        }

        bootstrap();
    }
})();
