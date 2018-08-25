import {
  FeatureSet,
  TransformNode,
  TransformNodeInfo
} from 'broccoli-node-api';

class Plugin implements TransformNode {
  public inputPaths: string[];
  public outputPath: string;
  public cachePath: string;

  // tslint:disable-next-line:variable-name
  public __broccoliFeatures__: FeatureSet;

  protected _instantiationStack: string;
  protected _name: string;
  protected _annotation: string;
  protected _inputNodes: any[];
  protected _persistentOutput: boolean;
  protected _needsCache: boolean;

  protected _builderFeatures?: FeatureSet;
  protected builderFeatures?: FeatureSet;

  private _readCompat?: any;
  private _readCompatError?: Error;

  constructor(inputNodes, options) {
    // Remember current call stack (minus "Error" line)
    this._instantiationStack = new Error().stack.replace(/[^\n]*\n/, '');

    options = options || {};
    if (options.name != null) {
      this._name = options.name;
    } else if (this.constructor && this.constructor.name != null) {
      this._name = this.constructor.name;
    } else {
      this._name = 'Plugin';
    }
    this._annotation = options.annotation;

    const label =
      this._name +
      (this._annotation != null ? ' (' + this._annotation + ')' : '');
    if (!Array.isArray(inputNodes)) {
      throw new TypeError(
        label +
          ': Expected an array of input nodes (input trees), got ' +
          inputNodes
      );
    }
    for (let i = 0; i < inputNodes.length; i++) {
      if (!isPossibleNode(inputNodes[i])) {
        throw new TypeError(
          label +
            ': Expected Broccoli node, got ' +
            inputNodes[i] +
            ' for inputNodes[' +
            i +
            ']'
        );
      }
    }

    this._inputNodes = inputNodes;
    this._persistentOutput = !!options.persistentOutput;
    this._needsCache = options.needsCache != null ? !!options.needsCache : true;

    this._checkOverrides();
  }
  public _checkOverrides() {
    if (typeof (this as any).rebuild === 'function') {
      throw new Error(
        'For compatibility, plugins must not define a plugin.rebuild() function'
      );
    }
    if (this.read !== Plugin.prototype.read) {
      throw new Error(
        'For compatibility, plugins must not define a plugin.read() function'
      );
    }
    if (this.cleanup !== Plugin.prototype.cleanup) {
      throw new Error(
        'For compatibility, plugins must not define a plugin.cleanup() function'
      );
    }
  }

  // The Broccoli builder calls plugin.__broccoliGetInfo__
  public __broccoliGetInfo__(builderFeatures: FeatureSet) {
    this.builderFeatures = this._checkBuilderFeatures(builderFeatures);

    const nodeInfo: TransformNodeInfo = {
      annotation: this._annotation,
      nodeType: 'transform',
      // tslint:disable-next-line:object-literal-sort-keys
      inputNodes: this._inputNodes,
      setup: this._setup.bind(this),
      getCallbackObject: this.getCallbackObject.bind(this), // .build, indirectly
      instantiationStack: this._instantiationStack,
      name: this._name,
      persistentOutput: this._persistentOutput,
      needsCache: this._needsCache
    };

    // Go backwards in time, removing properties from nodeInfo if they are not
    // supported by the builder. Add new features at the top.
    if (!this.builderFeatures.needsCacheFlag) {
      delete nodeInfo.needsCache;
    }

    return nodeInfo;
  }

  public _checkBuilderFeatures(builderFeatures) {
    if (builderFeatures == null) {
      builderFeatures = this.__broccoliFeatures__;
    }
    if (
      !builderFeatures.persistentOutputFlag ||
      !builderFeatures.sourceDirectories
    ) {
      // No builder in the wild implements less than these.
      throw new Error(
        'Minimum builderFeatures required: { persistentOutputFlag: true, sourceDirectories: true }'
      );
    }
    return builderFeatures;
  }

  public _setup(builderFeatures, options) {
    builderFeatures = this._checkBuilderFeatures(builderFeatures);
    this._builderFeatures = builderFeatures;
    this.inputPaths = options.inputPaths;
    this.outputPath = options.outputPath;
    if (!this.builderFeatures.needsCacheFlag) {
      this.cachePath = this._needsCache ? options.cachePath : undefined;
    } else {
      this.cachePath = options.cachePath;
    }
  }

  public toString() {
    return (
      '[' +
      this._name +
      (this._annotation != null ? ': ' + this._annotation : '') +
      ']'
    );
  }

  // Return obj on which the builder will call obj.build() repeatedly
  //
  // This indirection allows subclasses like broccoli-caching-writer to hook
  // into calls from the builder, by returning { build: someFunction }
  public getCallbackObject() {
    return this;
  }

  public build() {
    throw new Error('Plugin subclasses must implement a .build() function');
  }

  // Compatibility code so plugins can run on old, .read-based Broccoli:

  public read(readTree) {
    if (this._readCompat == null) {
      try {
        this._initializeReadCompat(); // call this.__broccoliGetInfo__()
      } catch (err) {
        // Prevent trying to initialize again on next .read
        this._readCompat = false;
        // Remember error so we can throw it on all subsequent .read calls
        this._readCompatError = err;
      }
    }

    if (this._readCompatError != null) {
      throw this._readCompatError;
    }

    return this._readCompat.read(readTree);
  }

  public cleanup() {
    if (this._readCompat) {
      return this._readCompat.cleanup();
    }
  }

  public _initializeReadCompat() {
    // tslint:disable-next-line:variable-name
    const ReadCompat = require('./read_compat');
    this._readCompat = new ReadCompat(this);
  }
}

// For future extensibility, we version the API using feature flags
Plugin.prototype.__broccoliFeatures__ = Object.freeze({
  needsCacheFlag: true,
  persistentOutputFlag: true,
  sourceDirectories: true
});

function isPossibleNode(node) {
  const type = typeof node;

  if (node === null) {
    return false;
  } else if (type === 'string') {
    return true;
  } else if (
    type === 'object' &&
    typeof node.__broccoliGetInfo__ === 'function'
  ) {
    // Broccoli 1.x+
    return true;
  } else if (type === 'object' && typeof node.read === 'function') {
    // Broccoli / broccoli-builder <= 0.18
    return true;
  } else {
    return false;
  }
}

export = Plugin;