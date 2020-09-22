.PHONY: publish test coveralls lint

VERSION=1.0.0-beta.5
VERSION_DASH=`echo -n "1.0.0-beta.5" | sed "s/-/%E2%80%93/"`
BRANCH=`git branch | grep '^*' | sed 's/* //'`
DATE=`date -uR`
YEAR=`date +%Y`
DATE_SHORT=`date +%Y-%m-%d`
TESTS_CHECKSUM=`cat test.js tests/*.scm | md5sum spec/lips.spec.js | cut -d' ' -f 1`
COMMIT=`git rev-parse HEAD`
URL=`git config --get remote.origin.url`

MAKE=make
GIT=git
CD=cd
SED=sed
CP=cp
RM=rm
TEST=test
CAT=cat
NPM=npm
ESLINT=./node_modules/.bin/eslint
COVERALLS=./node_modules/.bin/coveralls
JEST=./node_modules/.bin/jest
NPM=npm
UGLIFY=./node_modules/.bin/uglifyjs
ROLLUP=./node_modules/.bin/rollup

ALL: Makefile  package.json .$(VERSION) dist/lips.js dist/lips.min.js README.md

dist/lips.js: src/lips.js .$(VERSION) rollup.config.js
	$(ROLLUP) -c
	$(SED) -i '/^\s*\/\*\*/,/^\s*\*\//d' dist/lips.js
	$(CAT) src/banner.js dist/lips.js > dist/tmp.js
	$(CP) dist/tmp.js dist/lips.js
	$(RM) dist/tmp.js
	$(GIT) branch | grep '* devel' > /dev/null && $(SED) -i -e "s/{{VER}}/DEV/g" -e "s/{{DATE}}/$(DATE)/g" \
	dist/lips.js || $(SED) -i -e "s/{{VER}}/$(VERSION)/g" -e "s/{{DATE}}/$(DATE)/g" -e "s/{{YEAR}}/${YEAR}/" \
	dist/lips.js

dist/lips.min.js: dist/lips.js .$(VERSION)
	$(UGLIFY) -o dist/lips.min.js --comments --mangle -- dist/lips.js

Makefile: templates/Makefile
	$(SED) -e "s/{{VER""SION}}/"$(VERSION)"/g" templates/Makefile > Makefile

package.json: templates/package.json .$(VERSION)
	$(SED) -e "s/{{VER}}/"$(VERSION)"/g" templates/package.json > package.json || true

README.md: templates/README.md dist/lips.js .$(VERSION)
	$(GIT) branch | grep '* devel' > /dev/null && $(SED) -e "s/{{VER}}/DEV/g" -e \
	"s/{{VER_DASH}}/$(VERSION_DASH)/g" -e "s/{{BRANCH}}/$(BRANCH)/g" -e "s/{{CHECKSUM}}/$(TESTS_CHECKSUM)/g" \
	-e "s/{{YEAR}}/${YEAR}/g"  -e "s/{{DATE}}/${DATE_SHORT}/" -e "s/{{COMMIT}}/$(COMMIT)/g" \
	< templates/README.md > README.md || \
	$(SED) -e "s/{{VER}}/$(VERSION)/g" -e "s/{{BRANCH}}/$(BRANCH)/g" -e "s/{{YEAR}}/${YEAR}/g" \
	-e "s/{{CHECKSUM}}/$(TESTS_CHECKSUM)/g" -e "s/{{COMMIT}}/$(COMMIT)/g" -e "s/{{DATE}}/${DATE_SHORT}/" \
	-e "s/{{VER_DASH}}/$(VERSION_DASH)/g" < templates/README.md > README.md

.$(VERSION): Makefile
	touch .$(VERSION)

publish-beta:
	$(GIT) clone $(URL) --depth 1 npm
	$(CD) npm && $(NPM) publish --access=public --tag beta
	$(RM) -rf npm

publish:
	$(GIT) clone $(URL) --depth 1 npm
	$(CD) npm && $(NPM) publish --access=public
	$(RM) -rf npm

jest-test: dist/lips.js
	@$(JEST) --coverage spec/*.spec.js

test:
	@$(NPM) run test

watch-test:
	@inotifywait -m -e close_write src/lips.js tests/*.scm | while read even; do $(MAKE) --no-print-directory test; done

watch-lint:
	@inotifywait -m -e close_write src/lips.js | while read even; do $(MAKE) --no-print-directory lint; done

watch-make:
	@inotifywait -m -e close_write src/lips.js | while read even; do $(MAKE) --no-print-directory; done

coveralls:
	$(NPM) run coverage

lint:
	$(ESLINT) src/lips.js spec/lips.spec.js
