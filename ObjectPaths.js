function shouldTriggerInvocation(objectPath) {
    var property_regex = /\.invoke\(.*\)/g;
    var result = property_regex.exec(objectPath);
    if (result == null) {
        return false;
    }
    return result.length > 0;
}

function delegateWrapper(objects, delegate) {
    this.objects = objects;
    this.delegate = delegate;
}
var path_procedures = [];
function getProcedure(name) {
    var obj = null;
    for (var i = 0, len = path_procedures.length; i < len; i++) {
        if (path_procedures[i].name == name) {
            obj = path_procedures[i];
        }
    }return obj;
}
function addProcedure(name, path, type) {
    var proc = { name: name, path: path, type: type, composite:false,compositePaths:null};
    path_procedures.push(proc);
    return proc;
}

function procedure(collection, name) {
    if (arguments.length == 2) {
        var proc = getProcedure(name);
        if (proc.type == "select") {
            return $select(collection, proc.path);
        } else if (proc.type == "filter") {
            return $filter(collection, proc.path);
        } else if (proc.type == "invoke") {
            if (proc.path.indexOf("=>") == -1) {
            new delegateWrapper( IsArraysAndUnwrap( collection), proc.path).invoke();
        } else {
            return new $invoke(collection, proc.path);
        }
        }
    } else {
    var returnCollection = collection;
        for (var i = 1, len = arguments.length; i < len; i++) {
            returnCollection = procedure(returnCollection, arguments[i]);
        }
        return returnCollection;
    }
}
function TriggerInvocation(array,objectPath) {
    var property_regex = /([A-Za-z0-9_$]*).invoke\((.*)\)/g;
    var match_collection = property_regex.exec(objectPath);
    var func_name = match_collection[1];
    var grouping = match_collection[2];
    var grouping_parameters = grouping.split(/,(?="|'|[0-9]*|\))/);
    internalForEach(array, function (i, v) {  
        eval("v." + func_name + "(" + grouping + ");");
    });
    return [];
}
function internalForEach(objects, callback) {
    for (var i = 0, len = objects.length; i < len; i++) {
        callback.call(objects[i],i, objects[i]);
    }
}

function internalMap(objects, callback) {
    var new_collection = [];
    internalForEach(objects, function (i, v) {
        if (callback(v, i)) {
            new_collection.push(v);
        }
    });
    return new_collection;
}
//Simple object used in the filtering process of an javascript array.
function propertyEvaluator(name, value, comparerType) {
    this.name = name;
    this.value = value;
    this.comparerType = comparerType;
}
//Used for handling property evaluators to filter result sets.
function filterByEvaluator(evaluator, objects) {
    var new_collection = [];


    for (var i = 0, len = objects.length; i < len; i++) {
        var propName = evaluator.name;
        var value = evaluator.value;
        try {
            if (objects[i][propName] instanceof Date) {
                value = Date.parse(value);
            }
        } catch (ex) {}
        if (evaluator.comparerType == "=") {
            if (typeof objects[i][propName] === "boolean") {
                value = value == "true";
                if (value == objects[i][propName]) {
                    new_collection.push(objects[i]);
                }
            } else {
                if (objects[i][propName] == value) {
                    new_collection.push(objects[i]);
                }
            }
        }
        if (evaluator.comparerType == "!=") {
            if (typeof objects[i][propName] === "boolean") {
                value = value == "true";
                if (objects[i][propName] != value) {
                    new_collection.push(objects[i]);
                }
            } else {
                if (objects[i][propName] != value) {
                    new_collection.push(objects[i]);
                }
            }
        }
        if (evaluator.comparerType == "^=") {
            if (objects[i][propName].indexOf(value) == 0) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == "$=") {
            var unwrappedValue = objects[i][propName];
            if (unwrappedValue.match(value + "$") == value) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == "=~") {
            if (objects[i][propName].match(new RegExp(value))) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == "*=") {
            var unwrappedValue = objects[i][propName];
            if (objects[i][propName].indexOf(value) != -1) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == ">") {
            if (objects[i][propName] > value) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == "<") {
            if (objects[i][propName] < value) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == ">=") {
            
            if (objects[i][propName] >= value) {
                new_collection.push(objects[i]);
            }
        }
        if (evaluator.comparerType == "<=") {
            if (objects[i][propName] <= value) {
                new_collection.push(objects[i]);
            }
        }
    }
    return new_collection;
}
//Used in wrapping a simple type so I can set its _parent_ property to a complex object and access it. And then allows me to override its toString method.
function simpleTypeWrapper(value, parent) {
    this.value = value;
    this._parent_ = parent;
}
simpleTypeWrapper.prototype.toString = function () {
    return this.value;
}
var key_filters = [];
function RegisterFilter(name, caller) {
    key_filters.push({ name: name, caller: caller });
}
RegisterFilter("even", function (array, index) {
    return internalMap(array, function (v, i) {
        return i % 2 == 0;
    });
});
RegisterFilter("odd", function (array, index) {
    return internalMap(array, function (v, i) {
        return i % 2 != 0;
    });
});
function ObjectSelector(selector, objects, isLast) {
    if (isLast == null) {
        isLast = false;
    }
    var filters = [];
    internalForEach(key_filters, function (i, v) {
        if (selector.indexOf(":" + v.name) != -1) {
            selector = selector.replace(":" + v.name, "");
            filters.push(v);
        }
    });
    if (shouldTriggerInvocation(selector)) {
        TriggerInvocation(objects, selector);
        return [];
    }
    //property regex used for determining and handling more complex selector expressions that include property evaluators.
    var property_regex = /(\s*[A-Za-z0-9_.]+\s*?)*\s*\[([A-Za-z0-9_]+?)([><=]+|[~$*\^!]?=~??)[']?([^\>~]*?)[']?\]/g;
    //simple regex used for simple tunneling procedures.
    var simple_regex = /(\s*[A-Za-z0-9_.]+\s*?)/g;
    var match_collection = [];
    var propertyEvaluators = new Array();
    var resultArray = objects;
    //used iterations to make sure the while loop doesn't cause the site to freeze. making sure to limit the loop count if an error occurs and it continues to loop.
    var max_iterations = 50;
    var iterations = 0;
    while (match_collection != null && iterations < max_iterations) {
        match_collection = property_regex.exec(selector);
        if (match_collection == null) {

            if (selector != null) {
                var simple = selector;
                //Make sure this is the 1st iteration or else it will pass on null.
                if (iterations == 0) {

                    var tunnelArray = [];
                    internalForEach(resultArray, function (i, v) {
                        var key = "";
                        var fetchItems = simple.indexOf(".items") != -1;
                        if (fetchItems) {
                            key = simple.replace('.items', '');
                        } else { key = simple; }
                        if (fetchItems) {
                            var unwrap = v[key];
                            if (unwrap != null) {
                                unwrap._parent_ = v;
                                internalForEach(unwrap, function (j, val) {
                                    //wraps up the simple/or complex type object in the array and sets its parent object underneath so I can reaccess it even if the object was a string and gets copied
                                    //into a new variable
                                    if (typeof val == "string") {
                                        var wrapper = new simpleTypeWrapper(val, unwrap);
                                        tunnelArray.push(wrapper);
                                    } else {
                                        val._parent_ = unwrap;
                                        tunnelArray.push(val);
                                    }
                                });
                            }
                        } else {

                            var unwrap = v[simple];
                            if (unwrap != null) {
                                unwrap._parent_ = v;
                                tunnelArray.push(v[simple]);
                            }
                        }
                    });
                    resultArray = tunnelArray;

                }
            }
        }
        iterations++

        if (match_collection != null) {
            //Check if a single property was defined for tunneling.
            if (match_collection[1] != null) {
                var simple = match_collection[1];
                var tunnelArray = [];
                internalForEach(resultArray, function (i, v) {
                    var key = "";
                    //Check if '.items' is defined. If so then assume the named single property is an array of types and to uwrap each value and add it to the tunnelArray.
                    // else just take the matching objects and push them to the tunnelArray.
                    var fetchItems = simple.indexOf(".items") != -1;
                    if (fetchItems) {
                        //fetch the simple property name to be tunnelled.
                        key = simple.replace('.items', '');
                    } else { key = simple; }
                    if (fetchItems) {
                        var unwrap = v[key];
                        if (unwrap != null) {
                            unwrap._parent_ = v;
                            if (unwrap != null) {
                                internalForEach(unwrap, function (j, val) {

                                    if (typeof val == "string") {
                                        var wrapper = new simpleTypeWrapper(val, unwrap);
                                        tunnelArray.push(wrapper);
                                    } else {
                                        val._parent_ = unwrap;
                                        tunnelArray.push(val);
                                    }
                                });
                            }

                        }
                    } else {
                        var unwrap = new Object();

                        if (simple == "" || simple == null) {
                            unwrap = v;
                            unwrap._parent_ = v._parent_;
                        } else {
                            unwrap = v[simple];
                            unwrap._parent_ = v;
                        }
                        if (unwrap != null) {

                            if (unwrap != null) {
                                tunnelArray.push(unwrap);
                            }
                        }

                    }
                });
                resultArray = tunnelArray;
            }

            //make sure that a [k=v] propertyEvaluator is defined as part of the selector segment, and if so, add a propertyEvaluator to later be used in the filtering process of the resultArray.
            if (match_collection[2] != null) {
                if (match_collection[2] != "") {

                    var evaluator = new propertyEvaluator(match_collection[2], match_collection[4], match_collection[3]);
                    propertyEvaluators.push(evaluator);
                }
            }
        }
    }
    //Go through each property evaluator and invoke it on the resultArray to get the filtered result set.
    for (var i = 0, len = propertyEvaluators.length; i < len; i++) {
        resultArray = filterByEvaluator(propertyEvaluators[i], resultArray);
    };
    internalForEach(filters, function (index, key_filter) {
        resultArray = key_filter.caller(resultArray, index);
    });
   
    if (objects[0] != null) {
        if (typeof objects[0][selector.replace(".items", "")] === 'function') {
            var unwrapItems = false;
            if (selector.indexOf(".items") > -1) {
                unwrapItems = true;
                selector = selector.replace(".items", "");
            }
            var wrap = new delegateWrapper(objects, selector);
            if (isLast) {
                if (unwrapItems) {
                    var returnContent = new Array();
                    wrap = wrap.invoke();
                    internalForEach(wrap, function (i, v) {
                        internalForEach(v, function (j, val) {
                            returnContent.push(val);
                        });
                    });
                    return new delegateWrapper(IsArraysAndUnwrap(returnContent), selector);
                } else {
                    if (isTypeArray(wrap.objects[0])) {
                        wrap.objects = wrap.objects.unwrapArrayofArrays();
                        return wrap;
                    }
                    return wrap;
                }
            } else {
            var returnContent = new Array();
                var wrap = new delegateWrapper(objects, selector);
                var invoked = wrap.invoke();
                internalForEach(invoked, function (i, v) {
                    internalForEach(v, function (j, val) {
                        returnContent.push(val);
                    });
                });
                return IsArraysAndUnwrap(returnContent);
            }
        }
}
if (!isLast) {
    if (resultArray != null) {
        return IsArraysAndUnwrap(resultArray);
    }
}
    return resultArray;
}
Array.prototype.unwrapArrayofArrays = function () {
    var result_unwrap = new Array();
    internalForEach(this, function (i_, v_) {
        internalForEach(v_, function (j_, val_) {
            result_unwrap.push(val_);
        });
    });
    return result_unwrap;
}
function IsArraysAndUnwrap(obj) {
    if (isTypeArray(obj[0])) {
        return obj.unwrapArrayofArrays();
    } else return obj;
}
function isTypeArray(obj){
        var s = typeof obj;
        if (s === "object") {
            return (obj instanceof Array);
        }
        return false;
}

//Extend the Array object for javascript to support selector filtering using the 'select' method.
Array.prototype.select = function (selector) {
    var parts = selector.split('=>');
    var resultSet = this;
    internalForEach(parts, function (i, v) {
        if (i == (parts.length - 1)) {

            resultSet = ObjectSelector(v, resultSet, true);
        } else {
            resultSet = ObjectSelector(v, resultSet, false);
        }

    });

    return resultSet;
};

Array.prototype.any = function () {
    return this.length > 0;
}

Array.prototype.filter = function (selector) {
    var original = this;
    var new_array = this.select(selector);
    var resultSet = new Array();
    internalForEach(new_array, function (i, v) {
        var current = v._parent_;
        var max_iterations = 50000;
        var current_iteration = 0;
        while (current != null && current_iteration++ < max_iterations) {
            if (current != null) {
                if (current._parent_ != null) {
                    current = current._parent_;
                }
            }
        }
        resultSet.push(current);
    });
    return resultSet;
};
Array.prototype.parents = function () {
    return internalMap(this, function (v, i) {
            return v._parent_;
    });
}
Array.prototype.each = function (iterator) {
    internalForEach(this, iterator);
}
Array.prototype.set = function (name, value) {
    this.each(function (i, v) {
        v[name] = value;
    });
}

Array.prototype.create = function () {
    return internalMap(function (i, v) {
        var o = new Object();
        for (var j = 0, len = arguments.length; j < len; j++) {
            o[arguments[j]] = v[j];
        }
        return o;
    });
}
Array.prototype.unwrap = function (name) {
    return this.select(name + ".items");
}
Array.prototype.eval = function (code) {
    $each(this, function (i, v) {
        eval(code);
    });
}
delegateWrapper.prototype.invoke = function () {
    var delegate = this.delegate;
    var args = arguments;
    var returnElements = new Array();
    internalForEach(this.objects, function (i, v) {
        var isFunction = eval("typeof v." + delegate + " === 'function'");
        if (isFunction) {
            var returnValue = eval("v." + delegate + ".apply(v,args)");
            returnElements.push(returnValue);
        }
    });
    return returnElements;
}
delegateWrapper.prototype.skip = function (count) {
    var objects = new Array();
    internalForEach(this.objects, function (i, v) {
        if (i <= (count - 1)) {

        } else {
            objects.push(v);
        }
    });
    return new delegateWrapper(objects, this.delegate) ;
}
delegateWrapper.prototype.take = function (count) {
    var objects = new Array();
    objects = this.objects.slice(0, count);
    return new delegateWrapper(objects, this.delegate);
}
function $s(array, selector) {
    return array.select(selector);
}
function $f(array, selector) {
    return array.filter(selector);
}
function $select(array, selector) {
    return $s(array, selector);
}
function $filter(array, selector) {
    return $f(array, selector);
}
function $i(array, selector) {
    if ( array.delegate != undefined) {
        return array.invoke(Array.prototype.slice.call(arguments).slice(1));
    } else {
        return array.select(selector).invoke(Array.prototype.slice.call(arguments).slice(2));
    }
}
function $invoke(array, selector) {
    return $i(array, selector);
}
function $each(arr, callback) {
    internalForEach(arr,callback);
}
