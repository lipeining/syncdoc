
const Changeset = require('./src/utils/Changeset');
const AttributePool = require('./src/utils/AttributePool');
const socketConfig = require('./socket.config');
const port = socketConfig.port;
const io = require('socket.io')(port);
const assert = require('assert');
io.use((socket, next) => {
  // const handshake = socket.handshake;
  // console.log(handshake);
  next();
});
const cacheDoc = {};
function initDoc({ docId }) {
  const atext = Changeset.makeAText(`test for ${docId}\n`);
  const pool = new AttributePool();
  return {
    docId,
    atext,
    pool,
    changesets: [],
    head: -1,
  };
}
const room = ({ docId })=>{ return `doc:${docId}`};
io.on('connection', socket => {
  console.log(`${socket.id} connect`);
  socket.on('initDoc', docId => {
    console.log(`${socket.id} is fetching doc: ${docId}`);
    if (!cacheDoc[docId]) {
      cacheDoc[docId] = initDoc({ docId });
    }
    socket.join(room({docId}));
    socket.emit('initDoc', cacheDoc[docId]);
  });
  socket.on('syncEvent', data => {
    // data = {baseRev, changeset, pool, docId};
    let {baseRev, changeset, pool, docId} = data;
    const doc = cacheDoc[docId];
    // assert(doc, `${docId} is not exist`);
    // assert(baseRev && baseRev <= doc.head, `baseRev ${baseRev} - head ${doc.head}`);
    // assert(changeset, `changeset is miss`);
    // assert(pool, `pool is miss`);
    console.log('syncEvent', data);
    const wireApool = (new AttributePool()).fromJsonable(pool); // 客户端的 pool
    Changeset.checkRep(changeset);
    changeset = Changeset.moveOpsToNewPool(changeset, wireApool, doc.pool);
    // 这里已经动态更新 服务器的 pool 了
    const needFollowCSs = doc.changesets.filter(item=>{
      return item.revNum > baseRev;
    });
    const apool = doc.pool;
    for (const needFollowCS of needFollowCSs) {
      // false 指代，客户端的先操作。
      changeset = Changeset.follow(needFollowCS.changeset, changeset, false, apool);
      baseRev++;
    }
    // 此时 baseRev 与 doc.head 应该一致
    console.log(baseRev, doc.head);
    const AText = Changeset.applyToAText(changeset, doc.atext, apool);
    doc.atext = Changeset.cloneAText(AText);
    doc.head = doc.head + 1;
    doc.changesets.push({changeset: changeset, revNum: doc.head});
    // 发送消息
    console.log('after sync event', doc.head, doc.atext, doc.pool, doc.changesets.length);
    console.log(changeset);
    socket.to(room({docId})).emit('userChange', { docId, changeset, pool: doc.pool, revNum: doc.head });
    socket.emit('syncAck', {docId, revNum: doc.head, });
  });
  socket.on('disconnect', () => {
    console.log('rooms:', socket.rooms);
    console.log(`${socket.id} disconnect`);
  });
});
console.log(`server start on ${port}`);
