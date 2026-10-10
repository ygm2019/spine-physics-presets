'use strict';
(function(root, factory) {
  const library = factory();
  if (typeof module === 'object' && module.exports) module.exports = library;
  else root.defaultPresetLibrary = library;
})(typeof window === 'object' ? window : globalThis, () => ({"format":"spine-physics-presets","version":1,"presets":[{"name":"头发","values":{"x":0,"y":0,"rotate":0.35,"scaleX":0.15,"shearX":0,"limit":5000,"fps":20,"inertia":0.75,"strength":60,"damping":0.88,"mass":1,"wind":0,"gravity":0,"mix":1,"noScale":true,"scaleY":"volume"}},{"name":"胸部","values":{"x":0.66,"y":0.66,"rotate":0,"scaleX":0,"shearX":0,"limit":5000,"fps":20,"inertia":0.9,"strength":50,"damping":0.88,"mass":1,"wind":0,"gravity":0,"mix":1,"noScale":false,"scaleY":"none"}},{"name":"蓬松衣服","values":{"x":0,"y":0,"rotate":0.5,"scaleX":0.22,"shearX":0,"limit":5000,"fps":20,"inertia":0.75,"strength":60,"damping":0.88,"mass":1.2,"wind":0,"gravity":0,"mix":1,"noScale":true,"scaleY":"volume"}}]}));
