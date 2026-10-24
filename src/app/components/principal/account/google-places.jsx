'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from '@/app/lib/text/text-provider';

// --- Tuning ---
const MIN_CHARS = 4;
const DEBOUNCE_MS = 1800;
const ALLOWED_COUNTRIES = ['MX', 'US', 'CA'];
const ALLOWED_COUNTRY_CODES = ['mx', 'us', 'ca'];

const GooglePlacesAutocomplete = ({ placeId, setPlaceId, setPostalCode, lock }) => {
  const { t } = useTranslation();

  // Refs
  const inputRef = useRef(null);
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const autocompleteRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autoServiceRef = useRef(null);
  const sessionTokenRef = useRef(null);
  const debounceRef = useRef(null);
  const isEditingRef = useRef(false);

  // State
  const [inputValue, setInputValue] = useState('');
  const [isMapReady, setIsMapReady] = useState(false);

  // --- Utils ---
  const newSessionToken = () => {
    if (!window.google?.maps?.places) return null;
    sessionTokenRef.current = new window.google.maps.places.AutocompleteSessionToken();
    return sessionTokenRef.current;
  };

  const clearMap = useCallback(() => {
    if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    
    if (mapInstanceRef.current) {
      mapInstanceRef.current.setZoom(12);
      // Centrar en una ubicación por defecto si es necesario
    }
  }, []);

  const ensureMap = useCallback(() => {
    if (!window.google || !mapRef.current || mapInstanceRef.current) return;

    mapInstanceRef.current = new window.google.maps.Map(mapRef.current, {
      zoom: 12,
      gestureHandling: 'none',
      zoomControl: false,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
    });

    placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstanceRef.current);
    autoServiceRef.current = new window.google.maps.places.AutocompleteService();
    newSessionToken();

    setIsMapReady(true);
  }, []);

  const ensureAutocompleteUI = useCallback(() => {
    if (!window.google || !inputRef.current || autocompleteRef.current) return;

    autocompleteRef.current = new window.google.maps.places.Autocomplete(inputRef.current, {
      fields: ['place_id', 'formatted_address', 'geometry', 'address_components', 'name'],
      types: ['address'],
      componentRestrictions: { country: ALLOWED_COUNTRY_CODES },
    });

    autocompleteRef.current.addListener('place_changed', () => {
      const place = autocompleteRef.current.getPlace();
      if (!place?.geometry?.location) return;

      if (!isAllowedCountry(place.address_components)) {
        alert(t('address.countryNotAllowed'));
        return;
      }

      setPlaceId?.(place.place_id || null);
      applyPostalCode(place.address_components);
      setInputValue(place.formatted_address || place.name || inputRef.current.value || '');

      moveMarker(
        { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
        place.geometry.viewport
      );

      newSessionToken();
      isEditingRef.current = false;
    });
  }, [setPlaceId, t]);

  const moveMarker = useCallback((latLng, viewport = null) => {
    const map = mapInstanceRef.current;
    if (!map) return;

    map.setCenter(latLng);
    if (viewport) map.fitBounds(viewport);
    else map.setZoom(15);

    if (!markerRef.current) {
      markerRef.current = new window.google.maps.Marker({
        position: latLng,
        map,
        icon: {
          url: 'https://maps.gstatic.com/mapfiles/api-3/images/spotlight-poi2.png',
          scaledSize: new window.google.maps.Size(27, 43),
        },
      });
    } else {
      markerRef.current.setPosition(latLng);
    }
  }, []);

  const applyPostalCode = (components) => {
    if (!components || !setPostalCode) return;
    const pc = components.find((c) => c.types?.includes('postal_code'));
    if (pc) setPostalCode(pc.long_name);
    else setPostalCode('');
  };

  const isAllowedCountry = (components) => {
    const c = components?.find((x) => x.types?.includes('country'));
    const code = c?.short_name?.toUpperCase();
    return ALLOWED_COUNTRIES.includes(code);
  };

  const isLikelyPlaceId = (value) => {
    if (typeof value !== 'string') return false;
    const trimmed = value.trim();
    if (!trimmed) return false;
    if (/[,\s]/.test(trimmed)) return false;
    return /^[A-Za-z0-9_-]{18,}$/.test(trimmed);
  };

  // --- Core functions ---
  const commitByPlaceId = useCallback((pid) => {
    if (!pid || !placesServiceRef.current) return;
    
    placesServiceRef.current.getDetails(
      { placeId: pid, fields: ['place_id','formatted_address','geometry','address_components'] },
      (place, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
        if (!isAllowedCountry(place.address_components)) return;

        setPlaceId?.(place.place_id || null);
        applyPostalCode(place.address_components);
        setInputValue(place.formatted_address || '');

        moveMarker(
          { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
          place.geometry.viewport
        );

        newSessionToken();
        isEditingRef.current = false;
      }
    );
  }, [moveMarker, setPlaceId]);

  const handleTextSearch = useCallback((text) => {
    if (!autoServiceRef.current) return;

    const token = sessionTokenRef.current || newSessionToken();
    
    autoServiceRef.current.getPlacePredictions(
      {
        input: text,
        componentRestrictions: { country: ALLOWED_COUNTRY_CODES },
        types: ['address'],
        sessionToken: token,
      },
      (predictions, status) => {
        if (status !== window.google.maps.places.PlacesServiceStatus.OK || !predictions?.length) {
          // Limpiar el mapa si no hay resultados
          if (text.length >= MIN_CHARS) {
            clearMap();
            setPlaceId?.(null);
            setPostalCode?.('');
          }
          return;
        }

        const top = predictions[0];
        if (!top.place_id) return;

        placesServiceRef.current.getDetails(
          { placeId: top.place_id, fields: ['geometry','address_components'], sessionToken: token },
          (place, dStatus) => {
            if (dStatus !== window.google.maps.places.PlacesServiceStatus.OK || !place?.geometry?.location) return;
            if (!isAllowedCountry(place.address_components)) return;

            setPlaceId?.(place.place_id || null);
            applyPostalCode(place.address_components);

            moveMarker(
              { lat: place.geometry.location.lat(), lng: place.geometry.location.lng() },
              place.geometry.viewport
            );
          }
        );
      }
    );
  }, [moveMarker, setPlaceId, setPostalCode, clearMap]);

  // --- Effects ---
  useEffect(() => {
    const handleMapsReady = () => {
      if (!window.google) return;
      ensureMap();
    };

    // Si el script ya se cargó, inicializar de inmediato
    if (typeof window !== 'undefined' && window.google) {
      handleMapsReady();
    }

    // Escuchar el evento lanzado al cargar el script en layout.js
    window.addEventListener('google-maps-loaded', handleMapsReady);
    return () => window.removeEventListener('google-maps-loaded', handleMapsReady);
  }, [ensureMap]);

  useEffect(() => {
    if (!isMapReady) return;
    ensureAutocompleteUI();
  }, [isMapReady, ensureAutocompleteUI]);

  useEffect(() => {
    if (isEditingRef.current) return;

    if (!placeId) {
      setInputValue('');
      if (isMapReady) clearMap();
      return;
    }

    const rawPlaceId = String(placeId).trim();
    if (!rawPlaceId) return;

    if (!isLikelyPlaceId(rawPlaceId)) {
      setInputValue(rawPlaceId);
      if (isMapReady) clearMap();
      return;
    }

    if (!isMapReady) return;
    commitByPlaceId(rawPlaceId);
  }, [placeId, isMapReady, commitByPlaceId, clearMap]);

  // --- Handlers ---
  const handleChange = (e) => {
    const value = e.target.value;
    setInputValue(value);
    isEditingRef.current = true;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    // Si el usuario borra todo, limpiar el estado
    if (value.trim() === '') {
      setPlaceId?.(null);
      setPostalCode?.('');
      clearMap();
      return;
    }

    if (value.trim().length >= MIN_CHARS) {
      debounceRef.current = setTimeout(() => {
        handleTextSearch(value.trim());
      }, DEBOUNCE_MS);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (inputValue.trim().length >= MIN_CHARS) {
        handleTextSearch(inputValue.trim());
      }
    }
  };

  const handleClear = () => {
    setInputValue('');
    setPlaceId?.(null);
    setPostalCode?.('');
    clearMap();
    isEditingRef.current = true;
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

    return (
        <div className="relative">
            <div className={`${lock ? 'block' : 'hidden'}`}>
                <span className='text-[rgb(var(--color-text))] opacity-80 text-xs'>* Cambia tu direccion desde los ajustes de tu cuenta.</span>
            </div>
            <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={t('account.address')}
                disabled={lock}
                className={`${lock ? 'bg-gray-200' : 'bg-white'} pr-10 block w-full rounded-md border-0 py-1.5 px-3 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6`}
            />
            <div
                ref={mapRef}
                className="w-full h-56 mt-3 border border-gray-300 rounded-md"
            />

        </div>
    );
};

export default GooglePlacesAutocomplete;
