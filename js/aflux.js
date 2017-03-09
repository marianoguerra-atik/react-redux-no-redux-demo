/*globals define, window, document, ReactDOM*/
define([], function () {
    'use strict';

    // object to have subscriptions and dispatch events
    function Subs() {
        this.subs = [];
        this._id = 0;
    }

    Subs.prototype = {
        // subscribe a callback, return id that can be used to unsubscribe
        subscribe: function(fn) {
            var id = this._genId();
            this.subs.push([id, fn]);
            return id;
        },
        // unsubscribe, just filter handlers with that id (the lazy way :)
        unsubscribe: function(id) {
            this.subs = this.subs.filter(function(sub) {
                return sub[0] !== id;
            });
        },
        // call all the subscribers passing params and an extra parameter,
        // for example in Event the extra parameter is the event name
        notify: function(params, extra) {
            var i, len, fn, subs = this.subs;

            for (i = 0, len = subs.length; i < len; i += 1) {
                fn = subs[i][1];
                fn(params, extra);
            }
        },
        // unsubscribe all
        unsubscribeAll: function () {
            this.subs = [];
        },
        // return number of subscribers, useful to find events that are
        // registered but have no subscribers (it means we can remove the
        // definition)
        count: function () {
            return this.subs.length;
        },
        // internal, generate a sequential id for the subscribers
        _genId: function() {
            this._id += 1;
            return '' + this._id;
        }
    };

    // Atom object, a wrapper around a value that provides methods to
    // mutate the value and methods to subscribe to changes on the value
    // Read more about it here: https://clojure.org/reference/atoms
    function Atom(value) {
        this._value = value;
        this.subs = new Subs();
    }

    Atom.prototype = {
        // pass a function that will be called with the current value being hold
        // in the atom and set the new value being hold to the value returned
        // by the function call, notify subscribers of the update (it will
        // notify subscribers even if the value didn't change)
        update: function(fn) {
            var currentValue = this._value;
            this._value = fn(currentValue);
            this.subs.notify(this._value, currentValue);
        },
        // utility function to merge the passed value into state, assumes
        // current value and value to merge are Immutable objects
        merge: function (value) {
            return this.update(function (st) {
                return st.merge(value);
            });
        },
        // reset the value to the one passed, utility function
        reset: function(value) {
            this.update(function(_currentValue) {
                return value;
            });
        },
        // return current value
        get: function() {
            return this._value;
        },
        // subscribe to updates
        subscribe: function(fn) {
            return this.subs.subscribe(fn);
        },
        // unsubscribe
        unsubscribe: function(id) {
            return this.subs.unsubscribe(id);
        },
        // unsubscribe all
        unsubscribeAll: function() {
            return this.subs.unsubscribeAll();
        }
    };

    // Event object, has a name (for easy introspection) and subscribers
    function Event(name) {
        this.name = name;
        this.subs = new Subs();
    }

    // utility function to shallow clone a plain js object
    function objShallowClone(obj) {
        var key, result = {};

        for (key in obj) {
            result[key] = obj[key];
        }

        return result;
    }

    Event.prototype = {
        // notify all subscribers about the event being fired passing parameters
        // and the name of the event as extra parameter
        dispatch: function(params) {
            this.subs.notify(params, this.name);
        },
        // dispatch event after timeout, if timeout isn't set it's set to 0
        // which means to fire immediatly after the current render loop
        // iteration finished running
        dispatchAfter: function(params, timeout) {
            var self = this;
            window.setTimeout(function() {
                self.dispatch(params);
            }, timeout || 0);
        },
        // return a function that when called will dispatch the event, useful
        // for click handlers that don't require to use the event parameter
        // passed to the callback
        dispatchCb: function(params) {
            var self = this;
            return function() {
                return self.dispatch(params);
            };
        },
        // return a function that when called whill extract the value field
        // from the target attribute (usually set by a change event) and
        // merge it into params (by shallow cloning), by default it's merged
        // into the value attribute, but if valueName is not falsy it will be
        // used as attribute name
        dispatchChangeCb: function(params, valueName) {
            var self = this;
            return function(event) {
                var newParams = objShallowClone(params);
                newParams[valueName || 'value'] = event.target.value;
                return self.dispatch(newParams);
            };
        },
        // return a function that will only dispatch the event if it's a keypress
        // and Enter was pressed
        dispatchEnterCb: function (params) {
            var self = this;
            return function(event) {
                if (event.key === 'Enter') {
                    return self.dispatch(params);
                }
            };
        },
        // subscribe to the event
        subscribe: function(fn) {
            return this.subs.subscribe(fn);
        },
        // unsubscribe from the event
        unsubscribe: function(id) {
            return this.subs.unsubscribe(id);
        }
    };

    // Query object, has a name, a reference to a state atom and a function
    // to run. Each time it's run it will extract fields from the current
    // state hold in the state atom and return it
    function Query(fn, name, state) {
        this.fn = fn;
        this.name = name;
        this.state = state;
    }

    // run the query with the current state value and passed params
    Query.prototype.run = function(params) {
        return this.fn(this.state.get(), params);
    };

    // Mutator object, has a name, a reference to a state atom and a function
    // to run. Each time it's run it will apply the function against the current
    // value hold in the state
    function Mutator(fn, name, state) {
        this.fn = fn;
        this.name = name;
        this.state = state;
    }

    Mutator.prototype = {
        // run the mutator passing the current state (atom) and passed params,
        // fn should return the new value
        run: function(params) {
            this.fn(this.state, params);
        },
        // run the mutator after timeout, if timeout is not set it will be set
        // to 0 by default, this means it will run right after the current
        // render loop finished. Useful for example to schedule to remove
        // an item from a list right after all the current event handlers
        // finished running, to avoid the potential problem where another
        // event handler accesses the object that was removed by a previous
        // event handler calling a mutator.
        runAfter: function (params, timeout) {
            var self = this;
            window.setTimeout(function () {
                self.fn(self.state, params);
            }, timeout || 0);
        }
    };

    // utility function that receives a "dummy" mutator (one that receives
    // the state *value* instead of the state *atom*) and returns a function
    // that extracts the value from the state atom and calls update on it
    // setting the new value on the state to the returned value.
    function stateUpdater(fn) {
        return function(stateAtom, params) {
            return stateAtom.update(function(state) {
                return fn(state, params);
            });
        };
    }

    // The App object, the main object from this module, it contains:
    // * state: an atom to a value used by queries to get the fields required
    //          by sub components and by mutators to update the state, also
    //          used by the object itself to be notified when the state changes
    //          so it can call rerender on next requestAnimationFrame
    // * rootNodeId: the id of the root node, kept only for hot code reloading
    // * rootNode: root DOM node where app is rendered
    // * queries: a map of names to Query instances
    // * events: a map of names to Event instances
    // * mutators: a map of names to Mutator instances
    // * rootRender: the root render function that is called passing the app
    //               instance itself and the returned value is rendered at
    //               rootNode
    // * prevState: reference to state used in last render
    // * curState: reference to current state, used to check against prevState,
    //             when different, we must rerender
    //
    // some other more internal attributes that I use in another application
    // (instadeq.com) but that are not used in this example
    // * afterRenderQueue: queue of operations to run right after render,
    //                     now it's used to focus elements after initial render
    // * unmountChecks: list of nodes to watch and call a specified callback
    //                  when the node is unmounted, there are other ways to do
    //                  it but this one is simple enough as long as you are not
    //                  watching too many unmounts
    function App(opts) {
        this.state = new Atom(opts.initialState);
        this.rootNodeId = opts.rootNode;
        this.rootNode = document.getElementById(opts.rootNode);
        this.queries = {};
        this.events = {};
        this.mutators = {};
        this.rootRender = opts.render;
        this.afterRenderQueue = [];
        this.unmountChecks = [];
        this._id = 0;

        this.prevState = null;
        this.curState = this.state.get();
    }

    // utility function to focus a node if it's focusable
    function focus(node, opts) {
        node.focus();

        if (opts.select && typeof node.select === 'function') {
            node.select();
        }
    }

    App.prototype = {
        // add a query instance with a given name
        addQuery: function (name, fn) {
            this.queries[name] = new Query(fn, name, this.state);
        },
        // add multiple queries at once, queries is an object from names to
        // query functions
        addQueries: function (queries) {
            for (var name in queries) {
                this.addQuery(name, queries[name]);
            }
        },
        // add a mutator instance with a given name
        addMutator: function (name, mutator) {
            this.mutators[name] = new Mutator(stateUpdater(mutator), name,
                this.state);
        },
        // add multiple mutators at once, mutators is an object from names to
        // mutator functions functions
        addMutators: function (mutators) {
            for (var name in mutators) {
                this.addMutator(name, mutators[name]);
            }
        },
        // add an event with a given name
        addEvent: function (name) {
            this.events[name] = new Event(name);
        },
        // add multiple events at once, events is an array of event names
        addEvents: function (events) {
            for (var i = 0, len = events.length; i < len; i += 1) {
                this.addEvent(events[i]);
            }
        },
        // render current state inconditionally
        render: function() {
            ReactDOM.render(this.rootRender(this),
                this.rootNode,
                this.afterRender.bind(this));
        },
        // renderNow is used by event handlers that want to render synchronously
        renderNow: function() {
            this.checkRender();
        },
        // check if we should render
        checkRender: function() {
            // compare by reference since state should be immutable
            if (this.prevState !== this.curState) {
                // if different, current state is prev state
                this.prevState = this.curState;
                // and render
                this.render();
            }
        },
        // start render loop, will call requestAnimationFrame on each state
        // change, which will call checkRender
        startRenderLoop: function() {
            // we don't have a previous state
            var prevState = null,
                // initialize current state
                curState = this.state.get(),
                self = this,
                checkRender = self.checkRender.bind(self);

            self.state.subscribe(function(newState) {
                // update current state with the value passed by the Atom event
                self.curState = newState;
                // schedule checkRender for next animation frame
                window.requestAnimationFrame(checkRender);
            });

            // call initial render
            self.render();
        },
        // stop render loop
        stop: function () {
            this.state.unsubscribeAll();
        },
        // callback called after render finished
        afterRender: function () {
            var node, select,
                rootNode = this.rootNode;
            // for each after render object
            this.afterRenderQueue = this.afterRenderQueue.filter(function (item) {
                // get a reference to the node they need
                var node = document.getElementById(item.id),
                    keep;

                // if node exists
                if (node) {
                    // call function
                    item.fn(node, item.opts);
                    // remove from afterRenderQueue
                    keep = false;
                } else {
                    // if node doesn't exists, increment count of times checked
                    item.count += 1;
                    // if count is less than maxCount
                    if (item.count < item.maxCount) {
                        // we keep it in the after render queue
                        keep = true;
                    } else {
                        // otherwise we remove it
                        keep = false;
                    }
                }

                return keep;
            });

            // for each unmount check
            this.unmountChecks = this.unmountChecks.filter(function (item) {
                var node = item.node;
                // check if removed
                if (!rootNode.contains(node)) {
                    // call function
                    item.fn(node, item.opts);
                    // remove from list
                    return false;
                } else {
                    // otherwise keep it
                    return true;
                }
            });
        },
        // add a callback to focus after render
        focusAfterRender: function (id, select) {
            this.afterRenderQueue.push({
                fn: focus,
                id: id,
                count: 0,
                maxCount: 2,
                opts: {select: !!select}
            });
        },
        // add a callback to call after mount
        onMount: function (id, fn, opts) {
            this.afterRenderQueue.push({
                fn: fn,
                id: id,
                count: 0,
                maxCount: 5,
                opts: opts
            });
        },
        // add a callback to call after unmount
        onUnmount: function (node, fn, opts) {
            this.unmountChecks.push({fn: fn, node: node, opts: opts});
        },
        // utility function to generate unique ids, for example, for inputs
        // we want to focus
        genId: function (prefix) {
            this._id += 1;
            return (prefix || 'afluxId') + this._id;
        }
    };

    return {App: App};
});
