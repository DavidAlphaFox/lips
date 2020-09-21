#!/usr/bin/env -S node --no-deprecation --experimental-import-meta-resolve --trace-warnings

import {
    exec,
    Formatter,
    balanced_parenthesis,
    tokenize,
    Interpreter,
    LSymbol,
    Macro,
    LString,
    evaluate,
    nil,
    version,
    date,
    Pair,
    env,
    banner,
    InputPort,
    OutputPort } from '../src/lips.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { format } from 'util';
import readline from 'readline';
import highlight from 'prism-cli';
import Prism from 'prismjs';
import 'prismjs/components/prism-scheme.min.js';
import '../lib/js/prism.js';
import { createRequire } from 'module';

const kDebounceHistoryMS = 15;

// -----------------------------------------------------------------------------
process.on('uncaughtException', function (err) {
  log_error(err.message);
});

// -----------------------------------------------------------------------------
function log_error(message) {
    fs.appendFileSync('error.log', message + '\n');
}
function debug(message) {
    console.log(message);
}
// -----------------------------------------------------------------------------
// code taken from jQuery Terminal
function parse_options(arg, options) {
    var settings = Object.assign({}, {
        boolean: []
    }, options);
    var result = {
        _: []
    };
    function token(value) {
        this.value = value;
    }
    var rest = arg.reduce(function(acc, arg) {
        if (typeof arg !== 'string') {
            arg = String(arg);
        }
        if (arg.match(/^-/) && acc instanceof token) {
            result[acc.value] = true;
        }
        if (arg.match(/^--/)) {
            var name = arg.replace(/^--/, '');
            if (settings.boolean.indexOf(name) === -1) {
                return new token(name);
            } else {
                result[name] = true;
            }
        } else if (arg.match(/^-/)) {
            var single = arg.replace(/^-/, '').split('');
            if (settings.boolean.indexOf(single.slice(-1)[0]) === -1) {
                var last = single.pop();
            }
            single.forEach(function(single) {
                result[single] = true;
            });
            if (last) {
                return new token(last);
            }
        } else if (acc instanceof token) {
            result[acc.value] = arg;
        } else if (arg) {
            result._.push(arg);
        }
        return null;
    }, null);
    if (rest instanceof token) {
        result[rest.value] = true;
    }
    return result;
}

// -----------------------------------------------------------------------------
function run(code, interpreter, dynamic = false, env = null) {
    if (typeof code !== 'string') {
        code = code.toString();
    }
    return interpreter.exec(code, dynamic, env).catch(function(e) {
        console.error(e.message);
        console.error('Call (stack-trace) to see the stack');
        console.error('Thrown exception is in global exception variable, use ' +
                      '(display exception.stack) to display JS stack trace');
        log_error(e.message);
        console.log(e.stack);
        if (e.code) {
            strace = e.code.map((line, i) => {
                var prefix = `[${i+1}]: `;
                var formatter = new Formatter(line);
                var output = formatter.break().format({
                    offset: prefix.length
                });
                return prefix + output;
            }).join('\n');
        }
        global.exception = e;
    });
}

// -----------------------------------------------------------------------------
function print(result) {
    if (result.length) {
        var last = result.pop();
        if (last !== undefined) {
            var ret = env.get('repr')(last, true);
            console.log(ret.toString());
        }
    }
}
// -----------------------------------------------------------------------------

function boostrap(interpreter) {
    var list = ['./lib/bootstrap.scm', './lib/R5RS.scm', './lib/R7RS.scm'];

    const require = createRequire(import.meta.url);
    return (function next() {
        var name = list.shift();
        if (name) {
            var path;
            try {
                path = require.resolve(`./${name}`);
            } catch (e) {
                try {
                    path = require.resolve(`../${name}`);
                } catch (e) {
                    path = require.resolve(`@jcubic/lips/${name}`);
                }
            }
            var data = fs.readFileSync(path).toString();
            return run(data, interpreter, false, env.parent).then(next);
        }
    })();
}

// -----------------------------------------------------------------------------
function indent(code, indent, offset) {
    var formatter = new Formatter(code);
    return formatter.indent({
        indent,
        offset
    });
}

// -----------------------------------------------------------------------------
function doc(fn, doc) {
    fn.__doc__ = doc.split('\n').map(function(line) {
        return line.trim();
    }).join('\n');
    return fn;
}

// -----------------------------------------------------------------------------
function scheme(str) {
    return highlight(str, 'scheme', { grammar: Prism.languages.scheme });
}

// -----------------------------------------------------------------------------
var strace;
var rl;
var newline;
var interp = Interpreter('repl', {
    stdin: InputPort(function() {
        return new Promise(function(resolve) {
            rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            rl.question('', function(data) {
                resolve(data);
                rl.close();
            });
        });
    }),
    stdout: OutputPort(function(x) {
        var repr = this.get('repr')(x);
        newline = !repr.match(/\n$/);
        process.stdout.write(repr);
    }),
    'stack-trace': doc(function() {
        if (strace) {
            console.log(strace);
        }
    }, `(stack-trace)

        Function display stack trace of last error`),
    exit: doc(function() {
        process.exit();
    }, `(exit)

        Function exits LIPS script or the REPL.`),
    help: doc(new Macro('help', function(code, { error }) {
        var new_code = new Pair(new LSymbol('__help'), code);
        var doc = evaluate(new_code, { env: this, error });
        console.log(doc);
    }), env.get('help').__doc__),
    '__help': env.get('help')
});

// -----------------------------------------------------------------------------
const boolean = ['d', 'dynamic', 'q', 'quiet', 'V', 'version'];
const options = parse_options(process.argv.slice(2), { boolean });
if (options.version || options.V) {
    // SRFI 176
    global.output = Pair.fromArray([
        ["command", "lips"],
        ["website", "https://jcubic.github.io/lips/"],
        ['languages', 'scheme', 'r5rs', 'r7rs'].map(LSymbol),
        ['encodings', 'utf-8'].map(LSymbol),
        ["scheme.srfi", 4, 6, 22, 23, 46, 176],
        ["release", version],
        ["os.uname", os.platform(), os.release()],
        ["os.env.LANG", process.env.LANG],
        ["os.env.TERM", process.env.TERM],
        ["build.date", date.match(/^\{\{|\}\}$/) ? date : new Date(date).toISOString()]
    ].map(([key, ...values]) => {
        return [LSymbol(key), ...values];
    }));
    boostrap(interp).then(function() {
        return run('(for-each (lambda (x) (write x) (newline)) output)', interp, options.d || options.dynamic);
    });
} else if (options.e || options.eval || options.c || options.code) {
    // from 1.0 documentation should use -e but it's not breaking change
    boostrap(interp).then(function() {
        const code = options.e || options.eval || options.c || options.code;
        const dynamic = options.d || options.dynamic;
        return run(code, interp, dynamic).then(print);
    });
} else if (options._.length === 1) {
    // hack for node-gtk
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.on('exit', () => {
        if (rl._flushing) {
            rl.pause();
            return rl.once('flushHistory', () => {
                process.exit();
            });
        }
        process.exit();
    });
    fs.promises.readFile(options._[0]).then(function(data) {
        return boostrap(interp).then(() => {
            const code = data.toString().replace(/^#!.*\n/, '');
            const dynamic = options.d || options.dynamic;
            return run(code, interp, dynamic);
        });
    }).catch(err => {
        log_error(err.message || err);
        console.error(err);
    }).finally(function() {
        rl.close();
    });
} else if (options.h || options.help) {
    var name = process.argv[1];
    var intro = banner.replace(/(me>\n)[\s\S]+$/, '$1');
    console.log(format('%s\nusage:\n  %s -q | -h | -c <code> | <filename> | -d\n\n  [-h --help]\t\tthis' +
                       ' help message\n  [-e --eval]\t\texecute code\n  [-V --version]\tdisplay version' +
                       'information according to srfi-176\n  [-q --quiet]\t\tdon\'t display banner in R' +
                       'EPL\n  [-d --dynamic]\trun interpreter with dynamic scope\n\nif called without ' +
                       'arguments it will run REPL and if called with one argument\nit will treat it as' +
                       ' filename and execute it.', intro, path.basename(name)));
} else {
    const dynamic = options.d || options.dynamic;
    const entry = '   ' + (dynamic ? 'dynamic' : 'lexical') + ' scope $1';
    if (process.stdin.isTTY && !options.q && !options.quiet) {
        console.log(banner.replace(/(\n\nLIPS.+)/m, entry));
    }
    var prompt = 'lips> ';
    var continuePrompt = '... ';
    var terminal = !!process.stdin.isTTY && !(process.env.EMACS || process.env.INSIDE_EMACS);
    rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: prompt,
        terminal
    });
    rl._writeToOutput = function _writeToOutput(string) {
        rl.output.write(scheme(string));
    };
    process.stdin.on('keypress', (c, k) => {
        setTimeout(function() {
            rl._refreshLine(); // force refresh colors
        }, 0);
    });
    const historySize = Number(env.LIPS_REPL_HISTORY_SIZE);
    if (!Number.isNaN(historySize) && historySize > 0) {
        rl.historySize = historySize;
    } else {
        rl.historySize = 1000;
    }
    setupHistory(rl, terminal ? env.LIPS_REPL_HISTORY : '', run_repl);
}
function run_repl(err, rl) {
    const dynamic = options.d || options.dynamic;
    var code = '';
    var multiline = false;
    var resolve;
    // we use promise loop to fix issue when copy paste list of S-Expression
    var prev_eval = Promise.resolve();
    if (process.stdin.isTTY) {
        rl.prompt();
    }
    var prev_line;
    boostrap(interp).then(function() {
        rl.on('line', function(line) {
            code += line + '\n';
            var format, spaces, stdout;
            var lines = code.split('\n');
            // fix previous line
            if (terminal && lines.length > 1) {
                prev_line = lines[lines.length - 2].replace(/^\s+/, '');
                if (lines.length > 2) {
                    var prev = lines.slice(0, -2).join('\n');
                    var i = indent(prev, 2, prompt.length - continuePrompt.length);
                    spaces = new Array(i + 1).join(' ');
                    lines[lines.length - 2] = spaces + prev_line;
                    code = lines.join('\n');
                    stdout = continuePrompt + spaces;
                } else {
                    stdout = prompt;
                }
                stdout += scheme(prev_line);
                format = '\x1b[1F\x1b[K' + stdout + '\n';
                process.stdout.write(format);
            }
            try {
                if (balanced_parenthesis(code)) {
                    rl.pause();
                    prev_eval = prev_eval.then(function() {
                        var result = run(code, interp, dynamic);
                        code = '';
                        return result;
                    }).then(function(result) {
                        if (process.stdin.isTTY) {
                            print(result);
                            if (newline) {
                                // readline don't work with not endend lines
                                // it ignore those so we end then ourselfs
                                process.stdout.write("\n");
                                newline = false;
                            }
                            if (multiline) {
                                rl.setPrompt(prompt);
                                multiline = false;
                            }
                            rl.prompt();
                        }
                        rl.resume();
                    }).catch(function() {
                        if (process.stdin.isTTY) {
                            if (multiline) {
                                rl.setPrompt(prompt);
                                multiline = false;
                            }
                            rl.prompt();
                        }
                    });
                } else {
                    multiline = true;
                    var ind = indent(code, 2, prompt.length - continuePrompt.length);
                    rl.setPrompt(continuePrompt);
                    rl.prompt();
                    spaces = new Array(ind + 1).join(' ');
                    if (terminal) {
                        rl.write(spaces);
                    }
                }
            } catch (e) {
                console.error(e.message);
                code = '';
                rl.prompt();
            }
        });
    }).catch(function(e) {
        log_error('Internal Error: boostrap filed');
        log_error(e.message || e);
        console.error('Internal Error: boostrap filed');
    });
}

// source: Node.js https://github.com/nodejs/node/blob/master/lib/internal/repl/history.js
function _writeToOutput(repl, message) {
  repl._writeToOutput(message);
  repl._refreshLine();
}

function setupHistory(repl, historyPath, ready) {
  // Empty string disables persistent history
  if (typeof historyPath === 'string')
    historyPath = historyPath.trim();

  if (historyPath === '') {
    repl._historyPrev = _replHistoryMessage;
    return ready(null, repl);
  }

  if (!historyPath) {
    try {
      historyPath = path.join(os.homedir(), '.lips_repl_history');
    } catch (err) {
      _writeToOutput(repl, '\nError: Could not get the home directory.\n' +
        'REPL session history will not be persisted.\n');

      debug(err.stack);
      repl._historyPrev = _replHistoryMessage;
      return ready(null, repl);
    }
  }

  let timer = null;
  let writing = false;
  let pending = false;
  repl.pause();
  // History files are conventionally not readable by others:
  // https://github.com/nodejs/node/issues/3392
  // https://github.com/nodejs/node/pull/3394
  fs.open(historyPath, 'a+', 0o0600, oninit);

  function oninit(err, hnd) {
    if (err) {
      // Cannot open history file.
      // Don't crash, just don't persist history.
      _writeToOutput(repl, '\nError: Could not open history file.\n' +
        'REPL session history will not be persisted.\n');
      debug(err.stack);

      repl._historyPrev = _replHistoryMessage;
      repl.resume();
      return ready(null, repl);
    }
    fs.close(hnd, onclose);
  }

  function onclose(err) {
    if (err) {
      return ready(err);
    }
    fs.readFile(historyPath, 'utf8', onread);
  }

  function onread(err, data) {
    if (err) {
      return ready(err);
    }

    if (data) {
      repl.history = data.split(/[\n\r]+/, repl.historySize);
    } else {
      repl.history = [];
    }

    fs.open(historyPath, 'r+', onhandle);
  }

  function onhandle(err, hnd) {
    if (err) {
      return ready(err);
    }
    fs.ftruncate(hnd, 0, (err) => {
      repl._historyHandle = hnd;
      repl.on('line', online);
      repl.once('exit', onexit);

      // Reading the file data out erases it
      repl.once('flushHistory', function() {
        repl.resume();
        ready(null, repl);
      });
      flushHistory();
    });
  }

  // ------ history listeners ------
  function online(line) {
    repl._flushing = true;

    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(flushHistory, kDebounceHistoryMS);
  }

  function flushHistory() {
    timer = null;
    if (writing) {
      pending = true;
      return;
    }
    writing = true;
    const historyData = repl.history.join(os.EOL);
    fs.write(repl._historyHandle, historyData, 0, 'utf8', onwritten);
  }

  function onwritten(err, data) {
    writing = false;
    if (pending) {
      pending = false;
      online();
    } else {
      repl._flushing = Boolean(timer);
      if (!repl._flushing) {
        repl.emit('flushHistory');
      }
    }
  }

  function onexit() {
    if (repl._flushing) {
      repl.once('flushHistory', onexit);
      return;
    }
    repl.off('line', online);
    fs.close(repl._historyHandle, () => {});
  }
}

function _replHistoryMessage() {
  if (this.history.length === 0) {
    _writeToOutput(
      this,
      '\nPersistent history support disabled. Use user-writable path to enable.\n'
    );
  }
  this._historyPrev = readline.Interface.prototype._historyPrev;
  return this._historyPrev();
}
