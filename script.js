let map, panorama, directionsService, directionsRenderer;
let markerHover, infoWindowHover, markerGiallo;
let markersVerdi = [];
let routeArrows = [];
let currentRoutePath = [];
let allowFreeMovement = false;
let isUpdatingFromMap = false;
let longPressTimer = null;

let playInterval = null;
let currentPathIndex = 0;
let isPlaying = false;
let isDraggingYellowMarker = false;

function log(msg) {
    console.log(`[LOG] ${msg}`);
}

function toggleSidebar() {
    const sidebar = document.getElementById("sidebar");
    const toggleBtn = document.getElementById("sidebar-toggle");
    
    if (sidebar.style.transform === "translateX(-100%)") {
        sidebar.style.transform = "translateX(0)";
        toggleBtn.style.display = "none";
        log("Pannello laterale aperto.");
    } else {
        sidebar.style.transform = "translateX(-100%)";
        toggleBtn.style.display = "flex";
        log("Pannello laterale chiuso.");
    }
}

// Inizializzazione Google Identity Services (Login) al caricamento della pagina
window.onload = function () {
    if (typeof google !== 'undefined' && google.accounts) {
        google.accounts.id.initialize({
            client_id: "936267332054-ao5n6m8hotub832j6elepaju5j2b7qiq.apps.googleusercontent.com",
            callback: handleCredentialResponse
        });
        renderGoogleButton();
    }
};

function renderGoogleButton() {
    const buttonDiv = document.getElementById("google-login-btn-container");
    if (buttonDiv) {
        buttonDiv.style.display = "block";
        google.accounts.id.renderButton(buttonDiv, { theme: "outline", size: "large", width: "100%" });
    }
}

function handleCredentialResponse(response) {
    try {
        const payload = JSON.parse(atob(response.credential.split('.')[1]));
        log(`Utente autenticato con successo: ${payload.name} (${payload.email})`);

        // Sblocca l'interfaccia nascondendo il login e mostrando l'app
        document.getElementById("login-screen").style.display = "none";
        document.getElementById("app-container").style.display = "block";

        const userInfo = document.getElementById("user-info");
        userInfo.style.display = "flex";
        userInfo.innerHTML = `<span>👤 <b>${payload.name}</b></span> <button class="logout-btn" onclick="eseguiLogout()" style="background:#d93025; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Esci</button>`;

        // Avvia il caricamento di Google Maps solo dopo il login autorizzato
        inizializzaConfigurazioneMaps();
    } catch (e) {
        console.error("Errore decodifica token", e);
        document.getElementById("login-error").innerText = "Errore durante l'autenticazione.";
    }
}

function eseguiLogout() {
    google.accounts.id.disableAutoSelect();
    document.getElementById("app-container").style.display = "none";
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("login-error").innerText = "";
    renderGoogleButton();
    log("Disconnessione effettuata.");
}

function inizializzaConfigurazioneMaps() {
    if (map) return;
    fetch('/api/config')
        .then(res => res.json())
        .then(data => {
            const script = document.createElement('script');
            script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=places,geometry`;
            script.async = true;
            script.defer = true;
            script.onload = initMap;
            document.head.appendChild(script);
        })
        .catch(err => console.error("Errore caricamento configurazione:", err));
}

function initMap() {
    const udine = { lat: 46.0611, lng: 13.2381 };
    map = new google.maps.Map(document.getElementById("map"), {
        center: udine,
        zoom: 13,
        streetViewControl: false
    });

    panorama = new google.maps.StreetViewPanorama(document.getElementById("pano"), {
        position: udine,
        pov: { heading: 34, pitch: 10 }
    });

    map.setStreetView(panorama);

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({ map: map, suppressMarkers: true });

    markerHover = new google.maps.Marker({
        map: null,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 6,
            fillColor: "#ea4335",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 1.5
        }
    });

    infoWindowHover = new google.maps.InfoWindow();

    map.addListener("mousedown", (event) => avviaTimerAnteprima(event.latLng));
    map.addListener("touchstart", (event) => {
        if (event.latLng) avviaTimerAnteprima(event.latLng);
    });

    map.addListener("dragstart", () => {
        cancellaTimerAnteprima();
        chiudiAnteprima();
        fermaRiproduzione();
    });

    map.addListener("dragend", () => {
        const center = map.getCenter();
        if (center && !isDraggingYellowMarker) {
            const svService = new google.maps.StreetViewService();
            svService.getPanorama({ location: center, radius: 100 }, (data, status) => {
                if (status === "OK") {
                    isUpdatingFromMap = true;
                    panorama.setPosition(data.location.latLng);
                    isUpdatingFromMap = false;
                    aggiornaIndicePercorsoPiuVicino(data.location.latLng);
                }
            });
        }
    });

    map.addListener("click", (event) => {
        cancellaTimerAnteprima();
        chiudiAnteprima();
        aggiungiTappaDaClick(event.latLng);
    });

    map.addListener("dblclick", (event) => {
        cancellaTimerAnteprima();
        chiudiAnteprima();
        fermaRiproduzione();
        allowFreeMovement = true;
        const svService = new google.maps.StreetViewService();
        svService.getPanorama({ location: event.latLng, radius: 100 }, (data, status) => {
            if (status === "OK") {
                isUpdatingFromMap = true;
                panorama.setPosition(data.location.latLng);
                isUpdatingFromMap = false;
            }
        });
    });

    panorama.addListener("position_changed", () => {
        let pos = panorama.getPosition();
        if (pos) {
            if (currentRoutePath.length > 0 && !allowFreeMovement) {
                let closestPoint = trovaPuntoPiuVicinoSulPercorso(pos);
                if (closestPoint) pos = closestPoint;
            }

            if (!markerGiallo) {
                markerGiallo = new google.maps.Marker({
                    position: pos,
                    map: map,
                    draggable: true,
                    icon: {
                        path: google.maps.SymbolPath.CIRCLE,
                        scale: 13,
                        fillColor: "#fbbc04",
                        fillOpacity: 1,
                        strokeColor: "#ffffff",
                        strokeWeight: 2.5
                    },
                    title: "Trascina il pallino lungo il percorso"
                });

                markerGiallo.addListener("dragstart", () => {
                    isDraggingYellowMarker = true;
                    fermaRiproduzione();
                });

                markerGiallo.addListener("drag", (event) => {
                    if (currentRoutePath.length > 0) {
                        let closest = trovaPuntoPiuVicinoSulPercorso(event.latLng);
                        if (closest) {
                            markerGiallo.setPosition(closest);
                            isUpdatingFromMap = true;
                            panorama.setPosition(closest);
                            isUpdatingFromMap = false;
                            aggiornaIndicePercorsoPiuVicino(closest);
                        }
                    }
                });

                markerGiallo.addListener("dragend", (event) => {
                    isDraggingYellowMarker = false;
                    let target = event.latLng;
                    if (currentRoutePath.length > 0) {
                        target = trovaPuntoPiuVicinoSulPercorso(event.latLng);
                    }
                    if (target) {
                        isUpdatingFromMap = true;
                        panorama.setPosition(target);
                        isUpdatingFromMap = false;
                        aggiornaIndicePercorsoPiuVicino(target);
                    }
                });
            } else {
                if (!isDraggingYellowMarker) markerGiallo.setPosition(pos);
                markerGiallo.setMap(map);
            }

            if (!isUpdatingFromMap && !isDraggingYellowMarker) {
                map.setCenter(pos);
            }

            if (currentRoutePath.length > 0 && !allowFreeMovement) {
                allineaStreetViewAllaStrada(pos);
            }
        }
    });

    setupAutocomplete("origin-input", "check-origin");
    setupAutocomplete("destination-input", "check-dest");
    creaControlliPlayPausaUI();

    const originInput = document.getElementById("origin-input");
    const destInput = document.getElementById("destination-input");
    if (originInput && !originInput.value) originInput.value = "Udine";
    if (destInput && !destInput.value) destInput.value = "Nimis";

    calcolaPercorso();
    log("Mappa e servizi inizializzati con successo.");
}

function creaControlliPlayPausaUI() {
    const postCalcControls = document.getElementById("post-calc-controls");
    if (postCalcControls && !document.getElementById("btn-play-route")) {
        const playContainer = document.createElement("div");
        playContainer.style.cssText = "display: flex; gap: 6px; margin-top: 10px; width: 100%; align-items: center;";
        playContainer.innerHTML = `
            <button id="btn-play-route" onclick="togglePlayRoute()" style="flex:2; background:#1a73e8; color:white; border:none; padding:8px; border-radius:4px; cursor:pointer; font-weight:500;">▶ Play Rotatoria</button>
            <button onclick="stepRouteForward(-3)" title="Indietro" style="flex:1; background:#f1f3f4; border:1px solid #dadce0; padding:8px; border-radius:4px; cursor:pointer;">◀◀</button>
            <button onclick="stepRouteForward(3)" title="Avanti" style="flex:1; background:#f1f3f4; border:1px solid #dadce0; padding:8px; border-radius:4px; cursor:pointer;">▶▶</button>
        `;
        postCalcControls.parentNode.insertBefore(playContainer, postCalcControls.nextSibling);
    }
}

function avviaTimerAnteprima(latLng) {
    cancellaTimerAnteprima();
    longPressTimer = setTimeout(() => {
        mostraAnteprimaStreetView(latLng);
    }, 600);
}

function cancellaTimerAnteprima() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function chiudiAnteprima() {
    markerHover.setMap(null);
    infoWindowHover.close();
}

function mostraAnteprimaStreetView(targetPos) {
    markerHover.setPosition(targetPos);
    if (!markerHover.getMap()) markerHover.setMap(map);

    fetch('/api/config').then(res => res.json()).then(data => {
        const streetViewImgUrl = `https://maps.googleapis.com/maps/api/streetview?size=200x120&location=${targetPos.lat()},${targetPos.lng()}&fov=90&heading=235&pitch=10&key=${data.apiKey}`;
        const contentString = `
            <div class="sv-preview-box" style="text-align:center;">
                <b style="font-size:12px; color:#202124;">Anteprima Street View</b><br>
                <img src="${streetViewImgUrl}" alt="Street View Preview" style="border-radius:4px; margin-top:4px;" onerror="this.style.display='none'">
            </div>
        `;
        infoWindowHover.setContent(contentString);
        infoWindowHover.open(map, markerHover);
    });
}

function trovaPuntoPiuVicinoSulPercorso(targetPos) {
    if (!currentRoutePath || currentRoutePath.length === 0) return null;
    let closestPoint = currentRoutePath[0];
    let minDistance = Infinity;
    
    for (let i = 0; i < currentRoutePath.length; i++) {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(targetPos, currentRoutePath[i]);
        if (dist < minDistance) {
            minDistance = dist;
            closestPoint = currentRoutePath[i];
            currentPathIndex = i;
        }
    }
    return closestPoint;
}

function aggiornaIndicePercorsoPiuVicino(targetPos) {
    if (!currentRoutePath || currentRoutePath.length === 0) return;
    let minDistance = Infinity;
    for (let i = 0; i < currentRoutePath.length; i++) {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(targetPos, currentRoutePath[i]);
        if (dist < minDistance) {
            minDistance = dist;
            currentPathIndex = i;
        }
    }
}

function togglePlayRoute() {
    const btn = document.getElementById("btn-play-route");
    if (isPlaying) {
        fermaRiproduzione();
        if (btn) {
            btn.innerText = "▶ Play Rotatoria";
            btn.style.background = "#1a73e8";
        }
    } else {
        if (currentRoutePath.length === 0) return;
        isPlaying = true;
        if (btn) {
            btn.innerText = "❚❚ Pausa";
            btn.style.background = "#d93025";
        }
        playInterval = setInterval(() => {
            if (currentPathIndex < currentRoutePath.length) {
                isUpdatingFromMap = true;
                panorama.setPosition(currentRoutePath[currentPathIndex]);
                isUpdatingFromMap = false;
                currentPathIndex++;
            } else {
                fermaRiproduzione();
                if (btn) {
                    btn.innerText = "▶ Play Rotatoria";
                    btn.style.background = "#1a73e8";
                }
            }
        }, 1000);
    }
}

function fermaRiproduzione() {
    if (playInterval) {
        clearInterval(playInterval);
        playInterval = null;
    }
    isPlaying = false;
}

function stepRouteForward(steps) {
    fermaRiproduzione();
    const btn = document.getElementById("btn-play-route");
    if (btn) {
        btn.innerText = "▶ Play Rotatoria";
        btn.style.background = "#1a73e8";
    }
    
    currentPathIndex += steps;
    if (currentPathIndex >= currentRoutePath.length) currentPathIndex = currentRoutePath.length - 1;
    if (currentPathIndex < 0) currentPathIndex = 0;
    
    if (currentRoutePath[currentPathIndex]) {
        isUpdatingFromMap = true;
        panorama.setPosition(currentRoutePath[currentPathIndex]);
        isUpdatingFromMap = false;
    }
}

function setTravelMode(mode, btnElement) {
    document.getElementById("travel-mode").value = mode;
    document.querySelectorAll(".travel-mode-btn").forEach(b => b.classList.remove("active"));
    btnElement.classList.add("active");
    calcolaPercorso();
}

function setupAutocomplete(inputId, checkId) {
    const input = document.getElementById(inputId);
    const check = document.getElementById(checkId);
    if (!input) return;
    
    const autocomplete = new google.maps.places.Autocomplete(input);
    autocomplete.addListener("place_changed", () => {
        const place = autocomplete.getPlace();
        if (place.geometry && place.geometry.location) {
            input.style.borderColor = "#137333";
            input.style.backgroundColor = "#e6f4ea";
            if (check) check.style.display = "block";
            aggiungiMarkerVerde(place.geometry.location, input.value);
            calcolaPercorso();
        } else {
            input.style.borderColor = "#d93025";
            input.style.backgroundColor = "#fce8e6";
            if (check) check.style.display = "none";
        }
    });

    input.addEventListener("input", () => {
        input.style.borderColor = "#dadce0";
        input.style.backgroundColor = "#f8f9fa";
        if (check) check.style.display = "none";
    });
}

function aggiungiMarkerVerde(location, title) {
    const marker = new google.maps.Marker({
        position: location,
        map: map,
        icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 7,
            fillColor: "#34a853",
            fillOpacity: 1,
            strokeColor: "#ffffff",
            strokeWeight: 2
        },
        title: title,
        draggable: true
    });

    marker.addListener('dragend', (event) => {
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ location: event.latLng }, (results, status) => {
            if (status === "OK" && results[0]) {
                marker.setTitle(results[0].formatted_address);
                calcolaPercorso();
            }
        });
    });

    markersVerdi.push(marker);
}

function aggiungiTappaIntermedia(valore = "") {
    const container = document.getElementById("tappe-container");
    const div = document.createElement("div");
    div.className = "tappa-row";
    const uniqueId = "tappa-" + Date.now();
    div.innerHTML = `
        <div class="input-container" style="width:100%; display:flex; align-items:center; margin-bottom:6px;">
            <span class="input-icon">📍</span>
            <input type="text" class="tappa-input" id="${uniqueId}" value="${valore}" placeholder="Aggiungi tappa" style="flex:1; padding:6px;">
            <span class="status-check" id="check-${uniqueId}" style="display:none;">✓</span>
        </div>
        <button class="btn-remove-tappa" onclick="this.parentElement.remove(); calcolaPercorso();" title="Rimuovi">×</button>`;
    container.appendChild(div);
    
    if(valore !== "") {
        document.getElementById(`check-${uniqueId}`).style.display = "block";
    }
    setupAutocomplete(uniqueId, `check-${uniqueId}`);
}

function aggiungiTappaDaClick(latLng) {
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ location: latLng }, (results, status) => {
        if (status === "OK" && results[0]) {
            aggiungiTappaIntermedia(results[0].formatted_address);
            aggiungiMarkerVerde(latLng, results[0].formatted_address);
            calcolaPercorso();
        }
    });
}

function calcolaPercorso() {
    allowFreeMovement = false;
    fermaRiproduzione();
    currentPathIndex = 0;
    
    const origin = document.getElementById("origin-input").value.trim();
    const destination = document.getElementById("destination-input").value.trim();

    if (!origin || !destination) return;

    const mode = document.getElementById("travel-mode").value;
    const tappaInputs = document.querySelectorAll(".tappa-input");
    let waypoints = [];
    tappaInputs.forEach(input => {
        if(input.value.trim() !== "") {
            waypoints.push({ location: input.value, stopover: true });
        }
    });

    const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode[mode],
        provideRouteAlternatives: false
    };

    directionsService.route(request, (result, status) => {
        if (status == "OK") {
            directionsRenderer.setMap(map);
            directionsRenderer.setDirections(result);
            currentRoutePath = result.routes[0].overview_path;
            disegnaFrecceDirezione(currentRoutePath);

            const route = result.routes[0];
            let distanzaTotale = 0;
            route.legs.forEach(leg => distanzaTotale += leg.distance.value);
            
            const km = (distanzaTotale / 1000).toFixed(1);
            const dislivelloStima = Math.round(distanzaTotale * 0.012);
            
            document.getElementById("info-distanza").innerText = km + " km";
            document.getElementById("info-dislivello").innerText = `Dislivello: ~${dislivelloStima}m`;
            
            document.getElementById("submit-route").style.display = "none";
            document.getElementById("route-info").style.display = "block";
            document.getElementById("post-calc-controls").style.display = "flex";
        } else {
            currentRoutePath = [];
        }
    });
}

function disegnaFrecceDirezione(path) {
    if (routeArrows && routeArrows.length > 0) {
        routeArrows.forEach(arrow => arrow.setMap(null));
    }
    routeArrows = [];

    for (let i = 5; i < path.length - 5; i += 12) {
        const current = path[i];
        const next = path[i + 1];
        const heading = google.maps.geometry.spherical.computeHeading(current, next);

        const arrowMarker = new google.maps.Marker({
            position: current,
            map: map,
            icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                scale: 4.5,
                fillColor: "#1a73e8",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 1.5,
                rotation: heading
            },
            clickable: false
        });
        routeArrows.push(arrowMarker);
    }
}

function allineaStreetViewAllaStrada(currentPos) {
    if (currentRoutePath.length < 2) return;
    let closestIndex = 0;
    let minDistance = Infinity;
    
    for (let i = 0; i < currentRoutePath.length; i++) {
        const dist = google.maps.geometry.spherical.computeDistanceBetween(currentPos, currentRoutePath[i]);
        if (dist < minDistance) {
            minDistance = dist;
            closestIndex = i;
        }
    }

    if (closestIndex < currentRoutePath.length - 1) {
        const heading = google.maps.geometry.spherical.computeHeading(
            currentRoutePath[closestIndex], 
            currentRoutePath[closestIndex + 1]
        );
        panorama.setPov({ heading: heading, pitch: 0 });
    }
}

function invertiPercorso() {
    const originInput = document.getElementById("origin-input");
    const destInput = document.getElementById("destination-input");
    const temp = originInput.value;
    originInput.value = destInput.value;
    destInput.value = temp;

    const tappaInputs = document.querySelectorAll(".tappa-input");
    let valoriTappe = Array.from(tappaInputs).map(i => i.value).reverse();
    tappaInputs.forEach((input, index) => {
        input.value = valoriTappe[index];
    });

    calcolaPercorso();
}

function mostraPulsanteCalcola() {
    document.getElementById("submit-route").style.display = "block";
    document.getElementById("route-info").style.display = "none";
    document.getElementById("post-calc-controls").style.display = "none";
    calcolaPercorso();
}

function importaGPX(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(e.target.result, "text/xml");
        const trkpts = xmlDoc.getElementsByTagName("trkpt");
        
        if (trkpts.length > 0) {
            let gpxPath = [];
            for (let i = 0; i < trkpts.length; i++) {
                const lat = parseFloat(trkpts[i].getAttribute("lat"));
                const lon = parseFloat(trkpts[i].getAttribute("lon"));
                gpxPath.push(new google.maps.LatLng(lat, lon));
            }
            
            document.getElementById("origin-input").value = `${trkpts[0].getAttribute("lat")}, ${trkpts[0].getAttribute("lon")}`;
            document.getElementById("destination-input").value = `${trkpts[trkpts.length-1].getAttribute("lat")}, ${trkpts[trkpts.length-1].getAttribute("lon")}`;
            
            currentRoutePath = gpxPath;
            if (directionsRenderer) directionsRenderer.setMap(null);

            disegnaFrecceDirezione(gpxPath);
            map.setCenter(gpxPath[0]);
            
            let distGPX = 0;
            for(let i=0; i<gpxPath.length-1; i++) {
                distGPX += google.maps.geometry.spherical.computeDistanceBetween(gpxPath[i], gpxPath[i+1]);
            }
            const km = (distGPX / 1000).toFixed(1);
            document.getElementById("info-distanza").innerText = km + " km (GPX)";
            document.getElementById("route-info").style.display = "block";
            document.getElementById("post-calc-controls").style.display = "flex";

            alert("Traccia GPX importata con successo e impostata come percorso da seguire!");
        }
    };
    reader.readAsText(file);
}

function apriMyMaps() {
    window.open("https://www.google.com/maps/about/mymaps/", "_blank");
}
