
.PHONY: dist
dist: setup
	rm -rf dist output
	mkdir -p dist/js dist/js-lib dist/css dist/css-lib dist/img
	r.js -o build/app.build.js
	cp output/app.js dist/js/
	cp index.html dist
	cp js-lib/vendor.min.js dist/js-lib/
	cp css-lib/vendor.min.css dist/css-lib/
	cat css/app.css | cssmin > dist/css/app.css
	zip -r dist dist

js-lib:
	mkdir -p js-lib

js-lib/immutable.min.js: js-lib
	cd js-lib && wget https://unpkg.com/immutable@3.8.1/dist/immutable.min.js

js-lib/react-dom.min.js: js-lib
	cd js-lib && wget https://unpkg.com/react-dom@15.4.2/dist/react-dom.min.js

js-lib/react.min.js: js-lib
	cd js-lib && wget https://unpkg.com/react@15.4.2/dist/react.min.js

js-lib/require.js: js-lib
	cd js-lib && wget https://unpkg.com/requirejs@2.3.3/require.js

js-lib/vendor.min.js: js-lib js-lib/immutable.min.js js-lib/react.min.js js-lib/react-dom.min.js
	cd js-lib && cat immutable.min.js react.min.js react-dom.min.js > vendor.min.js

css-lib/bootstrap.min.css:
	cd css-lib && wget https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0-alpha.6/css/bootstrap.min.css

css-lib:
	mkdir -p css-lib

css-lib/vendor.min.css: css-lib css-lib/bootstrap.min.css
	cd css-lib && cat bootstrap.min.css > vendor.min.css

setup: js-lib/require.js js-lib/vendor.min.js css-lib/vendor.min.css

.PHONY: serve
serve:
	python -m SimpleHTTPServer

.PHONY: clean
clean:
	rm -rf js-lib css-lib dist

