var path = require("path");
var fs = require("fs");
var vm = require("vm");

var RapydScript = vm.createContext({
    console       : console,
    readfile      : fs.readFileSync,
});

exports.parse_baselib = function(src_path, beautify) {
    var baselibAst;
    try {
        var baselibPath = path.join(src_path, 'baselib.pyj');
        baselibAst = RapydScript.parse(fs.readFileSync(baselibPath, "utf-8"));
    } catch(e) {
        if (e.code == "ENOENT") {
            throw "Failed to locate baselib module.";
        }
        else {
            throw e;
        }
    }
    var outputStream = RapydScript.OutputStream({
        private_scope: false,
        beautify: beautify,
        write_name: false,
        omit_baselib: true,  // We are generating baselib here, cannot depend on it
    });
    baselibAst.print(outputStream);
    return eval(outputStream.toString());  // jshint ignore:line
};

function load_global(file) {
    try {
        var code = fs.readFileSync(file, "utf8");
        return vm.runInContext(code, RapydScript, file);
    } catch(ex) {
        // XXX: in case of a syntax error, the message is kinda
        // useless. (no location information).
        console.error("ERROR in file: " + file + " / " + ex);
        process.exit(1);
    }
}

var FILENAMES = exports.FILENAMES = [
    "baselib",
    "utils",
    "ast",
    "parse",
    "output",
];

var FILES = exports.FILES = FILENAMES.map(function(file){
    return path.join(path.dirname(module.filename), '..', 'lib', file + '.js');
});

FILES.forEach(load_global);

RapydScript.AST_Node.warn_function = function(txt) {
    console.error(txt);
};

// XXX: perhaps we shouldn't export everything but heck, I'm lazy.
for (var i in RapydScript) {
    if (RapydScript.hasOwnProperty(i)) {
        exports[i] = RapydScript[i];
    }
}

exports.minify = function(files, options) {
    options = RapydScript.defaults(options, {
        fromString   : false,
        warnings     : false,
        output       : null,
    });
    if (typeof files == "string")
        files = [ files ];

    // 1. parse
    var toplevel = null;
    files.forEach(function(file){
        var code = (options.fromString) ? file : fs.readFileSync(file, "utf8");
        toplevel = RapydScript.parse(code, {
            filename: options.fromString ? "?" : file,
            toplevel: toplevel
        });
    });

    // 4. output
    var output = {};
    if (options.output) {
        RapydScript.merge(output, options.output);
    }
    var stream = RapydScript.OutputStream(output);
    toplevel.print(stream);
    return {
        code : stream + "",
    };
};

// exports.describe_ast = function() {
//     function doitem(ctor) {
//         var sub = {};
//         ctor.SUBCLASSES.forEach(function(ctor){
//             sub[ctor.TYPE] = doitem(ctor);
//         });
//         var ret = {};
//         if (ctor.SELF_PROPS.length > 0) ret.props = ctor.SELF_PROPS;
//         if (ctor.SUBCLASSES.length > 0) ret.sub = sub;
//         return ret;
//     }
//     return doitem(RapydScript.AST_Node).sub;
// }

exports.describe_ast = function() {
    var out = RapydScript.OutputStream({ beautify: true });
    function doitem(ctor) {
        out.print("AST_" + ctor.TYPE);
        var props = ctor.SELF_PROPS.filter(function(prop){
            return !/^\$/.test(prop);
        });
        if (props.length > 0) {
            out.space();
            out.with_parens(function(){
                props.forEach(function(prop, i){
                    if (i) out.space();
                    out.print(prop);
                });
            });
        }
        if (ctor.documentation) {
            out.space();
            out.print_string(ctor.documentation);
        }
        if (ctor.SUBCLASSES.length > 0) {
            out.space();
            out.with_block(function(){
                ctor.SUBCLASSES.forEach(function(ctor, i){
                    out.indent();
                    doitem(ctor);
                    out.newline();
                });
            });
        }
    }
    doitem(RapydScript.AST_Node);
    return out + "";
};
