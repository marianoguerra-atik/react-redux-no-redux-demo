/*globals define, window, Immutable, React, console, document, require*/
define(['./aflux'], function (Aflux) {
    'use strict';
    var Im = Immutable,
        D = React.DOM,
        div = D.div, h1 = D.h1, label = D.label, input = D.input, span = D.span,
        button = D.button;

    // receives a render function and returns a caching render function
    // the render function receives two arguments:
    //
    // * state: a plain js object where each value is either a "native" immutable
    //     value (numbers, booleans, strings) or an Immutable object.  the
    //     cached function will compare all the keys by reference with the last
    //     cached state and if any key doesn't match it will rerender and cache
    //     the rendered node and the state that generated it to compare on the
    //     next call.
    // * param: properties that the function requires, it can be the events
    //     object from app or the app reference itsefl
    //
    // the name parameter is only required to log the name of the function
    // when the cache hits or is missed.
    function cachedRenderFn(fn, name) {
        var lastDom, lastState = {};

        return function(state, param) {
            var key;

            for (key in state) {
                if (state[key] !== lastState[key]) {
                    lastDom = fn(state, param);
                    lastState = state;
                    console.log('miss', name);
                    return lastDom;
                }
            }

            console.log('hit', name);
            return lastDom;
        };
    }

    // simple example of how to reuse code without having to create components
    function btn(event, label) {
        return button({
            key: label,
            className: 'btn btn-secondary',
            onClick: event.dispatchCb({})
        }, label);
    }

    // render the counter section of the app, we can cache some constants
    // outside of the function to avoid allocation on each call, in this
    // case it's a little overkill since the values are so small and consist
    // only of strings which are immutable, but just to show how it would work
    // for constant objects I take two constant objects out of the function
    var counterFormGroupAttrs = {className: 'form-group'},
        counterCountAttrs = {style: {marginRight: '1em'}};
    function renderCounter(state, evs) {
        return div(counterFormGroupAttrs,
            span(counterCountAttrs, 'Count: ', state.count),
            div({className: 'btn-group'},
                // we pass the event that should fire to the two buttons
                btn(evs.incrementClicked, '+'),
                btn(evs.decrementClicked, '-')));
    }
    // here we create a cached version of renderCounter, read cachedRenderFn's
    // comments to see how it works
    var crenderCounter = cachedRenderFn(renderCounter, 'renderCounter');

    // render the title editor section, really similar to renderCounter
    function renderTitleEditor(state, evs) {
        return div({className: 'form-group'},
            label({htmlFor: 'title'}, 'Title: '),
            input({
                // here we use dispatchChangeCb that will return a function
                // that will receive a change event and will merge the value
                // of it into the parameter we pass (an empty object in this
                // case) by shallow merging to avoid mutating the original
                // parameter, check dispatchChangeCb in aflux.js for the
                // implementation
                onChange: evs.titleUpdated.dispatchChangeCb({}),
                className: 'form-control',
                id: 'title',
                value: state.title
            }));
    }
    // here we create a chaced version of renderTitleEditor
    var crenderTitleEditor = cachedRenderFn(renderTitleEditor, 'renderTitleEditor');

    // the root render function it receives a reference to app, it's called
    // every requestAnimationFrame only if the state changed
    function render(app) {
        var qs = app.queries,
            evs = app.events,
            // get the state required by the counter section
            counterState = qs.counterState.run(),
            // get the state required by the title editor section
            titleState = qs.titleState.run();

        return div({},
            // use the current title to render it here
            h1({}, titleState.title),
            // pass the required state to each render function and pass
            // the events object as second parameter since they only need
            // to fire events, they could also need to call queries if they
            // were "smart components"
            crenderCounter(counterState, evs),
            crenderTitleEditor(titleState, evs));
    }

    // function to implement hot code reload, it contains a specific part for
    // a requirejs application but the rest is generic
    function setupHotReload(app) {
        // we need a name to store the current state when reloading, to avoid
        // potential collisions and to signal that it's a private attribute
        // we add two underscores at the beginning
        var tempStateId = '__appTempState';

        // if there's already a reference to the app state, it means we are
        // setting up hot code reload because we are hot code reloading :)
        if (window[tempStateId]) {
            // we reset the app state (which should be the initial state since
            // we are hot code reloading) to the value stored in the atom
            // stored in the window object
            app.state.reset(window[tempStateId].get());
        }

        // we now store a reference to the current state in the global
        // reference, see the Atom implementation in aflux.js to understand
        // the difference between a value and an identity or watch this talk
        // https://www.infoq.com/presentations/Value-Values
        window[tempStateId] = app.state;

        // function that actually implements hot code reloading
        function reloadCode() {
            // get all the scripts in the document
            var scripts = document.getElementsByTagName('script'),
                // get all the styles in the document
                styles = document.getElementsByTagName('link');

            // stop the render loop
            app.stop();
            // clear the root node of the app
            document.getElementById(app.rootNodeId).innerHTML = '';

            // utility function since NodeList is not an Array
            function toArray(o) {
                return Array.prototype.slice.call(o);
            }

            // for each script
            toArray(scripts).forEach(function (s) {
                // (requirejs specific): we get the module implemented in
                // that script
                var modName = s.getAttribute('data-requiremodule');

                // if the script is a requirejs module
                if (modName) {
                    // we undefine it so next time it's required it's evaluated
                    // like the first time instead of returning the cached
                    // return of the first call
                    require.undef(modName);
                }
            });

            // for each style
            toArray(styles).forEach(function (s) {
                // we create a new link node
                var node = document.createElement('link'),
                    parent = s.parentNode;

                // we copy all the attributes from the old to the new
                toArray(s.attributes).forEach(function (attr) {
                    node.setAttribute(attr.name, s.getAttribute(attr.name));
                });

                // remove the old
                parent.removeChild(s);
                // add the new
                parent.appendChild(node);

            });

            // we require our app again
            require(['app'], function () {
                // when it finishes loading, this callback is called
                console.log('reloaded');
            });
        }

        // attach the reloadCode function to window in case you want to call
        // it from the console or something
        window.__appReloadCode = reloadCode;
        // calback called when we hit Ctrl+:
        function onReload(event) {
            // if we are hitting Ctrl+:
            if (event.key === ':' && event.ctrlKey) {
                // remove the current callback (because when it reloads it will
                // register the new one and it would fire N times where N is
                // the amount of reloads we did)
                window.removeEventListener('keypress', onReload);
                // actually reload the code
                reloadCode();
            }
        }
        // attach the callback to key press
        window.addEventListener('keypress', onReload);
    }

    // init function, called on first load and on hot code reload
    function init() {
        // we create an instance of our app
        var app = new Aflux.App({
                // specify the inital state
                initialState: Im.Map({
                    count: 0,
                    title: 'App Title'
                }),
                // id of the node where it will be rendered
                rootNode: 'app',
                // function to call to render the app
                render: render
            }),
            // shorter names for things we will use a lot
            qs = app.queries,
            evs = app.events,
            muts = app.mutators;

        // register events the application will use, this way if we write an
        // event with a typo it will cause an error at initial load and not
        // some hard to find bug at any point in the application usage
        // events are dispatched with parameters passed by the caller of
        // dispatch* functions, which are passed to functions that subscribe
        // to the event
        app.addEvents(['titleUpdated', 'incrementClicked', 'decrementClicked']);
        // register functions that can be called from event handlers to mutate
        // the state, mutators receive a reference to the state value (not the
        // Atom, but the current content, an instance of Immutable.Map), and
        // the parameters passed by the caller
        app.addMutators({
            updateCount: function (state, params) {
                // see https://facebook.github.io/immutable-js/docs/ for
                // a complete list of operations
                return state.update('count', function (count) {
                    return count + params.value;
                });
            },
            updateTitle: function (state, params) {
                return state.set('title', params.value);
            }
        });
        // register query functions that should only be called by "smart components"
        // close to the top of the application to pass only the required parts
        // of the state to deeper functions
        app.addQueries({
            // query for the counter part of the app, only the current count,
            // by convention it should always be a plain js object, to make
            // it work correctly with cached render functions it should always
            // be a plain object. We could enforce this in aflux.js addQuery
            // function if we wanted
            counterState: function (state) {
                return {count: state.get('count')};
            },
            titleState: function (state) {
                return {title: state.get('title')};
            }
        });

        // subscribe one handler to the incrementClicked event
        evs.incrementClicked.subscribe(function (params) {
            // call updateCount mutator passing the amount we want to change
            // the counter, 1 in this case.
            // mutators are not functions because in JS we can't inherit from
            // the Function prototype and we want to attach other properties
            // and methods to the mutator
            muts.updateCount.run({value: 1});
        });

        // subscribe one handler to the decrementClicked event, notice that
        // we use the same mutator as incrementClicked above
        evs.decrementClicked.subscribe(function (params) {
            muts.updateCount.run({value: -1});
        });

        // subscribe one handler to the titleUpdated event
        evs.titleUpdated.subscribe(function (params) {
            // update the title
            muts.updateTitle.run({value: params.value});
            // we render synchronously since by default we only render on
            // requestAnimationFrame, this will cause the cursor to jump to
            // the end of the input field if you are editing in the middle of
            // it.
            // try commenting the next line and editing the title in the middle
            // of input the text, see how it jumps to the end
            app.renderNow();
        });

        // start render loop
        app.startRenderLoop();
        // setup hot code reload
        setupHotReload(app);
    }

    // call init, it will be called on initial load and when hot code reloading
    // reloads the app module
    init();
});
