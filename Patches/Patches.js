
class FurnacePatching {

    static patchClass(klass, func, line_number, line, new_line) {
        let funcStr = func.toString()
        let lines = funcStr.split("\n")
        if (lines[line_number].trim() == line.trim()) {
            lines[line_number] = lines[line_number].replace(line, new_line);
            let fixed = lines.join("\n")
            if (klass !== undefined) {
                let classStr = klass.toString()
                fixed = classStr.replace(funcStr, fixed)
            } else {
                if (!fixed.startsWith("function"))
                    fixed = "function " + fixed
                if (fixed.startsWith("function async"))
                    fixed = fixed.replace("function async", "async function");
            }
            return Function('"use strict";return (' + fixed + ')')();
        } else {
            console.log("Cannot patch function. It has wrong content at line ", line_number, " : ", lines[line_number].trim(), " != ", line.trim(), "\n", funcStr)
        }
    }

    static patchFunction(func, line_number, line, new_line) {
        return FurnacePatching.patchClass(undefined, func, line_number, line, new_line)
    }
    static patchMethod(klass, func, line_number, line, new_line) {
        return FurnacePatching.patchClass(klass, klass.prototype[func], line_number, line, new_line)
    }

    static replaceFunction(klass, name, func) {
        klass[this.ORIG_PRREFIX + name] = klass[name]
        klass[name] = func
    }
    static replaceMethod(klass, name, func) {
        return this.replaceFunction(klass.prototype, name, func)
    }
    static replaceStaticGetter(klass, name, func) {
        let getterProperty = Object.getOwnPropertyDescriptor(klass, name);
        if (getterProperty == undefined)
            return false;
        Object.defineProperty(klass, FurnacePatching.ORIG_PRREFIX + name, getterProperty);
        Object.defineProperty(klass, name, { get: func });
        return true;
    }
    static replaceGetter(klass, name, func) {
        return this.replaceStaticGetter(klass.prototype, name, func)
    };

    // Would be the same code for callOriginalMethod as long as 'klass' is actually the instance
    static callOriginalFunction(klass, name, ...args) {
        return klass[this.ORIG_PRREFIX + name].call(klass, ...args)
    }
    static callOriginalGetter(klass, name) {
        return klass[this.ORIG_PRREFIX + name]
    }

    static init() {
        // Fix issue with moving/deleting multiple tokens when user is not viewing the scene where the update happens
        // https://gitlab.com/foundrynet/foundryvtt/issues/1800
        let deleteMany = FurnacePatching.patchFunction(PlaceablesLayer._deleteManyPlaceableObjects, 17,
            "object: layer.get(id)",
            "object: scene.isView ? layer.get(id) : null");
        if (deleteMany)
            PlaceablesLayer._deleteManyPlaceableObjects = deleteMany;
        let updateMany = FurnacePatching.patchFunction(PlaceablesLayer._updateManyPlaceableObjects, 17,
            "object: layer.get(id)",
            "object: scene.isView ? layer.get(id) : null");
        if (updateMany)
            updateMany = FurnacePatching.patchFunction(updateMany, 25,
                "mergeObject(update.source, update.data);",
                `mergeObject(update.source, update.data);
                 if ( !update.object ) continue;`);
        if (updateMany)
            PlaceablesLayer._updateManyPlaceableObjects = updateMany;
        
        // Fixes https://gitlab.com/foundrynet/foundryvtt/issues/1801
        let webrtcClass = FurnacePatching.patchMethod(WebRTC, 'connect', 8,
            "password: game.user.data.password",
            `password: game.user.data.password || ""`);
        if (webrtcClass)
            WebRTC = webrtcClass;
    }
}
FurnacePatching.ORIG_PRREFIX = "__furnace_original_"

Hooks.on('init', FurnacePatching.init)