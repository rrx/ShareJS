// Generated by CoffeeScript 1.6.2
module.exports = function(instance, stream) {
  var agent, close, collections, handleMessage, isSubscribed, lastReceivedCollection, lastReceivedDoc, lastSentCollection, lastSentDoc, pump, queries, send, sendOp, seq, setSubscribed;

  close = function(err) {
    if (err) {
      console.warn(err);
      stream.emit('error', err);
    }
    stream.end();
    stream.emit('close');
    return stream.emit('end');
  };
  agent = null;
  lastSentCollection = null;
  lastSentDoc = null;
  lastReceivedCollection = null;
  lastReceivedDoc = null;
  seq = 1;
  collections = {};
  queries = {};
  setSubscribed = function(c, doc, value) {
    var docs;

    if (value == null) {
      value = true;
    }
    docs = (collections[c] || (collections[c] = {}));
    return docs[doc] = value;
  };
  isSubscribed = function(c, doc) {
    var _ref;

    return (_ref = collections[c]) != null ? _ref[doc] : void 0;
  };
  send = function(response) {
    if (response.c === lastSentCollection && response.doc === lastSentDoc) {
      delete response.c;
      delete response.doc;
    } else {
      lastSentCollection = response.c;
      lastSentDoc = response.doc;
    }
    return stream.write(response);
  };
  sendOp = function(collection, doc, data) {
    var msg;

    msg = {
      a: 'op',
      c: collection,
      doc: doc,
      v: data.v,
      src: data.src,
      seq: data.seq
    };
    if (data.op && data.src !== agent.sessionId) {
      msg.op = data.op;
    }
    if (data.create) {
      msg.create = data.create;
    }
    if (data.del) {
      msg.del = true;
    }
    return send(msg);
  };
  handleMessage = function(req, callback) {
    var autoFetch, collection, doc, error, index, opData, opstream, qid, qopts, query, subscribeToStream, _ref, _ref1, _ref2;

    error = null;
    if ((_ref = req.a) === 'qsub' || _ref === 'qfetch' || _ref === 'qunsub') {
      if (typeof req.id !== 'number') {
        error = 'Missing query ID';
      }
    } else {
      if (!(req.doc === void 0 || typeof req.doc === 'string' || (req.doc === void 0 && lastReceivedDoc))) {
        error = 'Invalid docName';
      }
      if ((req.doc || req.doc === null) && typeof req.c !== 'string') {
        error = 'missing or invalid collection';
      }
    }
    if (!(req.a === void 0 || ((_ref1 = req.a) === 'op' || _ref1 === 'sub' || _ref1 === 'unsub' || _ref1 === 'fetch' || _ref1 === 'qfetch' || _ref1 === 'qsub' || _ref1 === 'qunsub'))) {
      error = 'invalid action';
    }
    if (req.a === 'op') {
      if (!(req.v === null || (typeof req.v === 'number' && req.v >= 0))) {
        error = "'v' invalid";
      }
    }
    if (error) {
      console.warn("Invalid req ", req, " from " + (agent != null ? agent.sessionId : void 0) + ": " + error);
      return callback(error);
    }
    if ((_ref2 = req.a) === 'qfetch' || _ref2 === 'qsub' || _ref2 === 'qunsub') {
      qid = req.id;
      index = req.c;
      qopts = {};
      if (req.o) {
        autoFetch = req.o.f;
        qopts.poll = req.o.p;
        qopts.backend = req.o.b;
      }
    } else {
      if (req.doc === null) {
        lastReceivedCollection = req.c;
        req.doc = lastReceivedDoc = hat();
      } else if (req.doc !== void 0) {
        lastReceivedCollection = req.c;
        lastReceivedDoc = req.doc;
      } else {
        if (!(lastReceivedDoc && lastReceivedCollection)) {
          console.warn("msg.doc or collection missing in req " + req + " from " + agent.sessionId);
          return callback('c or doc missing');
        }
        req.c = lastReceivedCollection;
        req.doc = lastReceivedDoc;
      }
      doc = req.doc;
      collection = req.c;
    }
    switch (req.a) {
      case 'fetch':
        if (req.v) {
          return agent.getOps(collection, doc, req.v, -1, function(err, results) {
            var r, _i, _len;

            if (err) {
              return callback(err);
            }
            for (_i = 0, _len = results.length; _i < _len; _i++) {
              r = results[_i];
              sendOp(collection, doc, r);
            }
            return callback(null, {});
          });
        } else {
          return agent.fetch(collection, doc, function(err, data) {
            if (err) {
              return callback(err);
            }
            return callback(null, {
              data: {
                v: data.v,
                type: data.type,
                snapshot: data.data,
                meta: data.meta
              }
            });
          });
        }
        break;
      case 'sub':
        if (isSubscribed(collection, doc)) {
          return callback(null, {
            error: 'Already subscribed'
          });
        }
        setSubscribed(collection, doc);
        subscribeToStream = (function(collection, doc) {
          return function(opstream) {
            setSubscribed(collection, doc, opstream);
            opstream.on('data', function(data) {
              return sendOp(collection, doc, data);
            });
            return stream.on('finish', function() {
              return opstream.destroy();
            });
          };
        })(collection, doc);
        if (req.v) {
          return agent.subscribe(collection, doc, req.v, function(err, stream) {
            if (err) {
              setSubscribed(collection, doc, false);
              return callback(err);
            }
            callback(null, {});
            return subscribeToStream(stream);
          });
        } else {
          return agent.fetchAndSubscribe(collection, doc, function(err, data, stream) {
            if (err) {
              setSubscribed(collection, doc, false);
              return callback(err);
            }
            callback(null, {
              data: {
                v: data.v,
                type: data.type,
                snapshot: data.data,
                meta: data.meta
              }
            });
            return subscribeToStream(stream);
          });
        }
        break;
      case 'unsub':
        opstream = isSubscribed(collection, doc);
        if (!opstream) {
          return callback(null, {
            error: 'Already unsubscribed'
          });
        }
        opstream.destroy();
        setSubscribed(collection, doc, false);
        return callback(null, {});
      case 'op':
        opData = {
          op: req.op,
          v: req.v,
          src: req.src,
          seq: req.seq
        };
        if (req.create) {
          opData.create = req.create;
        }
        if (req.del) {
          opData.del = req.del;
        }
        if (!req.src) {
          opData.src = agent.sessionId;
          opData.seq = seq++;
        }
        return agent.submit(collection, doc, opData, function(err, v, ops) {
          var op, _i, _len;

          if (err) {
            return callback(null, {
              a: 'ack',
              error: err
            });
          } else {
            if (!isSubscribed(collection, doc)) {
              for (_i = 0, _len = ops.length; _i < _len; _i++) {
                op = ops[_i];
                sendOp(collection, doc, op);
              }
              sendOp(collection, doc, opData);
            }
            return callback(null, {
              a: 'ack'
            });
          }
        });
      case 'qfetch':
        return agent.queryFetch(index, req.q, function(err, results) {
          var r, _i, _len;

          if (err) {
            return callback(err);
          }
          for (_i = 0, _len = results.length; _i < _len; _i++) {
            r = results[_i];
            if (autoFetch) {
              r.snapshot = r.data;
            }
            delete r.data;
          }
          return callback(null, {
            id: qid,
            data: results
          });
        });
      case 'qsub':
        return agent.query(index, req.q, qopts, function(err, emitter) {
          var data, _i, _len, _ref3;

          if (err) {
            return callback(err);
          }
          if (queries[qid]) {
            return callback('ID in use');
          }
          queries[qid] = emitter;
          _ref3 = emitter.data;
          for (_i = 0, _len = _ref3.length; _i < _len; _i++) {
            data = _ref3[_i];
            if (autoFetch) {
              data.snapshot = data.data;
            }
            delete data.data;
          }
          callback(null, {
            id: qid,
            data: emitter.data,
            extra: emitter.extra
          });
          emitter.on('extra', function(extra) {
            return send({
              a: 'q',
              id: qid,
              extra: extra
            });
          });
          emitter.on('diff', function(diff) {
            var d, _j, _k, _len1, _len2, _ref4;

            for (_j = 0, _len1 = diff.length; _j < _len1; _j++) {
              d = diff[_j];
              if (d.type === 'insert') {
                _ref4 = d.values;
                for (_k = 0, _len2 = _ref4.length; _k < _len2; _k++) {
                  data = _ref4[_k];
                  if (autoFetch) {
                    data.snapshot = data.data;
                  }
                  delete data.data;
                }
              }
            }
            return send({
              a: 'q',
              id: qid,
              diff: diff
            });
          });
          return emitter.on('error', function(err) {
            return send({
              a: 'q',
              id: qid,
              error: err
            });
          });
        });
      case 'qunsub':
        query = queries[qid];
        if (query) {
          query.destroy();
          delete queries[qid];
        }
        return callback(null);
      default:
        console.warn('invalid message', req);
        return callback('invalid or unknown message');
    }
  };
  agent = instance.createAgent(stream);
  stream.write({
    a: 'init',
    protocol: 0,
    id: agent.sessionId
  });
  return (pump = function() {
    var reply, req;

    req = stream.read();
    if (!req) {
      stream.once('readable', pump);
      return;
    }
    reply = function(err, msg) {
      if (err) {
        msg = {
          a: req.a,
          error: err
        };
      } else {
        if (!msg.a) {
          msg.a = req.a;
        }
      }
      if (req.c) {
        msg.c = req.c;
      }
      if (req.doc) {
        msg.doc = req.doc;
      }
      if (req.id) {
        msg.id = req.id;
      }
      return send(msg);
    };
    return handleMessage(req, function(err, msg) {
      if (err || msg) {
        reply(err, msg);
      }
      return pump();
    });
  })();
};
