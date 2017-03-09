React Redux Demo, No Redux
==========================

Simple demo to show how to have a redux like application using only ImmutableJS
and a small subset of reactjs (which could be replaced with preact, infernojs
or any other react compatible library).

A redux-like pattern inspired by `re-frame <https://github.com/Day8/re-frame>`_
is implemented in the aflux.js file, the app is implemented in app.js

The build process is implemented using a Makefile.

Note: this repo is in marianoguerra-atik because it was a demo for a talk and I
don't plan to update it.

You can see the slides from the talk `here <http://marianoguerra.github.io/presentations/stuttgartjs-meetup-react-redux-no-tools/>`_

the tsort.js file has some sample code to implement topological sorting to
decide in which order to minify a tree of module dependencies so that every
module loads after all its dependencies, it was used as an example in the talk
to show how you could replace requirejs if you where a NIH fan.

Author
------

Mariano Guerra

License
-------

MIT
