import styles from "./doc.css";
import io from "socket.io-client";
import { Button } from "antd";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css"; // ES6
// with ES6 import
import React from "react";
// import { Delta } from "quill";
import Delta from "quill-delta";
const Changeset = require('../utils/Changeset');
const AttributePool = require('../utils/AttributePool');
const socketConfig = { port: 5000 };
const MODULES = {
  toolbar: [
    [{ header: [1, 2, false] }],
    ["bold", "italic", "underline", "strike", "blockquote"],
    [
      { list: "ordered" },
      { list: "bullet" },
      { indent: "-1" },
      { indent: "+1" }
    ],
    ["link", "image"],
    ["clean"]
  ]
};
const FORMATS = [
  "header",
  "bold",
  "italic",
  "underline",
  "strike",
  "blockquote",
  "list",
  "bullet",
  "indent",
  "link",
  "image"
];
// 基本原则是：与服务器的沟通都用 cs, 本地需要在合理处理 cs 的 compose, follow 之后，
// 得到需要执行的 delta，通过 quill 来更新文档内容。

/**
 *
 *
 * @param {string} {cs}
 * @param {AttributePool} {pool}
 */
function cs2delta({cs, pool}) {
  const delta = new Delta();
  const unpacked = Changeset.unpack(cs);
  const csIter = Changeset.opIterator(unpacked.ops);
  const bankIter = Changeset.stringIterator(unpacked.charBank);
  while(csIter.hasNext()) {
    const op = csIter.next();
    // op.attribs 表示这个操作的属性
    switch (op.opcode) {
      case '+':
        delta.insert(bankIter.take(op.chars));
        break;
      case '-':
        delta.delete(op.chars);
        break;
      case '=':
        delta.retain(op.chars);
        break;
    }
  }
  return delta;
}

// // Keep the next 5 characters
// { retain: 5 }

// // Keep and bold the next 5 characters
// { retain: 5, attributes: { bold: true } }

// // Keep and unbold the next 5 characters
// // More specifically, remove the bold key in the attributes Object
// // in the next 5 characters
// { retain: 5, attributes: { bold: null } }

// // Insert a bolded "Text"
// { insert: "Text", attributes: { bold: true } }

// // Insert a link
// { insert: "Google", attributes: { link: 'https://www.google.com' } }

// Insert another embed
// {
//   insert: { video: 'https://www.youtube.com/watch?v=dMH0bHeiRNg' },
//   attributes: {
//     width: 420,
//     height: 315
//   }
// }

// baseRev
// 0:
// "Z:bj<4i|2=m|3-5p*0+17$Register a new handler for the given event."
// 1:
// "Z:71>4i|2=m-17|3+5p$This pad text is synchronized as you type, so that everyone viewing this page sees the same text. This allows you to collaborate seamlessly on documents!↵↵Get involved with Etherpad at http://etherpad.org↵"

/**
 *
 *
 * @param {Object} {delta}
 * @param {Number} {oldLen}
 * @param {AttributePool} {pool}
 */
function delta2cs({ delta, oldLen,  pool }) {
  let bank=''; // from insert
  let opsStr=''; // transform the insert and attribues
  let newLen = oldLen; // count insert and delete
  // // 如何处理 lines 的操作符  |N |
  // Delta {ops: Array(6)}
  //   ops: Array(6)
  //       0:{retain: 28}
  //       1:{insert: "libraryDirectory: \n 'e"}
  //       2:{delete: 4}
  //       3:{retain: 1}
  //       4:{insert: "'"}
  //       5:{delete: 1}

  // // 直接使用 Changeset.makeSplice=function (oldFullText, spliceStart, numRemoved, newText, optNewTextAPairs, pool) ?
  for(const op of delta.ops) {
    if (op.retain) {
      opsStr += `=${Changeset.numToString(op.retain)}`;
      if (op.attributes) {

      }
    } else if(op.insert) {
      newLen += op.insert.length;
      bank += op.insert;
      opsStr += `+${Changeset.numToString(op.insert.length)}`;
      // opsStr
      // todo attributes
      if (op.attributes) {

      }
    } else if(op.delete) {
      opsStr += `-${Changeset.numToString(op.delete)}`;
      newLen -= op.delete;
    } else {
      console.log(`wrong op: ${JSON.stringify(op)}`);
    } 
  }
  return Changeset.pack(oldLen, newLen, opsStr, bank);
}
/**
 *
 *
 * @param {*} { delta, oldFullText, pool }
 */
function delta2csLines({ delta, oldFullText, oldLen, pool }) {
  // 理论所知：每一个 cs 都需要有基本的 olFullText, 也是在这里计算对应的 行数变动
  const assem =  Changeset.smartOpAssembler();
  const textIter = Changeset.stringIterator(oldFullText);
  // function appendOpWithText(opcode, text, attribs, pool){}
  // let newLen = oldLen;
  let newLen = oldLen;
  let bank=''; // from insert
  console.log('oldFullText.length: oldLen', oldFullText.length, oldLen);
  console.log(delta, oldFullText, oldLen);
  for(const op of delta.ops) {
    if (op.retain) {
      if (op.attributes) {
      }
      const text = textIter.take(op.retain);
      assem.appendOpWithText('=', text);
    } else if (op.insert) {
      if (op.attributes) {
      }
      const text = op.insert;
      assem.appendOpWithText('+', text);
      newLen += op.insert.length;
      bank += op.insert;
    } else if (op.delete) {
      const text = textIter.take(op.delete);
      assem.appendOpWithText('-', text);
      newLen -= op.delete;
    } else {
      console.log(`wrong op: ${JSON.stringify(op)}`);
    } 
  }
  assem.endDocument();
  const ops = assem.toString();
  console.log('assem', ops);
  return Changeset.pack(oldLen, newLen, ops, bank);
}

// onChange(content, delta, source, editor) : Called back with the new contents of the editor after change. It will be passed the HTML contents of the editor, 
// a delta object expressing the change, the source of the change, and finally a read-only proxy to editor accessors such as getHTML().
// warning Do not use this delta object as value, as it will cause a loop. Use editor.getContents() instead. See Using Deltas for details.

// onChangeSelection(range, source, editor) : Called back with the new selected range, or null when unfocused. It will be passed the selection range, the source of the change, and finally a read-only proxy to editor accessors such as getBounds().

// onFocus(range, source, editor) : Called when the editor becomes focused. It will receive the new selection range.

// onBlur(previousRange, source, editor) : Called when the editor loses focus. It will receive the selection range it had right before losing focus.

// onKeyPress(event) : Called after a key has been pressed and released. : Note that, like its native counterpart, this won't be called for special keys such as shift or enter. If you need those, hook onto onKeyDown or onKeyUp.

// onKeyDown(event) : Called after a key has been pressed, but before it is released. : Note that, due to how Quill works, it's possible that you won't receive events for keys such as enter, backspace or delete. If that's the case, try hooking onto onKeyUp instead.

// onKeyUp(event) : Called after a key has been released.


class Editor extends React.Component {
  constructor(props) {
    super(props)
    this.quillRef = null;      // Quill instance
    this.reactQuillRef = null; // ReactQuill component
    this.onChange = this.onChange.bind(this);
    this.modules = MODULES;
    this.formats = FORMATS;
    this.socket = props.socket;
    this.docId = props.docId;
    this.A = '';
    this.X = '';
    this.Y = '';
    this.Aunpacked = null;
    this.Xunpacked = null;
    this.Yunpacked = null;
    this._pool = null; // AttributePool 实例
    this._baseRev = -1;
    this.attachEvent(this.socket);
    this._initOK = false;
    this._YoldFullText = '';
  }
  attachEvent(socket) {
    socket.on("connect", () => {
      console.log(`component: ${socket.id}`);
    });
    socket.on("connect_error", error => {
      // ...
      console.log(error);
    });
    socket.on("connect_timeout", error => {
      // ...
      console.log(error);
    });
    socket.on("error", error => {
      // ...
      console.log(error);
    });
    socket.on("disconnect", reason => {
      if (reason === "io server disconnect") {
        // the disconnection was initiated by the server, you need to reconnect manually
        socket.connect();
      }
      // else the socket will automatically try to reconnect
    });
    socket.on("reconnect", attemptNumber => {
      // ...
      console.log(`atteattemptNumbermp: ${attemptNumber}`);
    });
    // ------------ server ---------------------
    socket.on('syncAck', (data)=>{
      // 监听到 ack
      // A <- AX
      // X <- identity
      const {docId, revNum } = data;
      this.A = Changeset.compose(this.A, this.X);
      console.log('sync ack revNum, baseRev', revNum, this._baseRev);
      this._baseRev = revNum;
      this.initX({length: this.Xunpacked.newLen});
    });
    socket.on('userChange', (data)=>{
      const {docId, changeset, pool, revNum }=data;
      // 从服务器得到了 B，需要计算出对应的 ops 并且 silent 更新 editor
      const apool = (new AttributePool()).fromJsonable(pool);
      const Api = Changeset.compose(this.A, changeset, apool);
      const Xpi = Changeset.follow(changeset, this.X, false, apool);
      const Bpi = Changeset.follow(this.X, changeset,false, apool)
      const Ypi = Changeset.follow(Bpi, this.Y, false, apool);
      const D = Changeset.follow(this.Y, Bpi, false, apool);
      this.A = Api;
      this.Aunpacked = Changeset.unpack(this.A);
      this.X = Xpi;
      this.Xunpacked = Changeset.unpack(this.X);
      this.Y = Ypi;
      this.Yunpacked = Changeset.unpack(this.Y);
      // 当前的视图，应该是 D 的 cs2delta
      // 此时需要更新本地的 pool 吗
      this._pool = apool;
      console.log('user change revNum, baseRev:', revNum, this._baseRev);
      this._baseRev = revNum;
      const delta = cs2delta({cs: D, pool: this._pool});
      this.quillRef.updateContents(delta, 'silent');
      const currentText = this.quillRef.getText();
      this._YoldFullText = currentText;
      console.log('user change y old full text:', this._YoldFullText);
    })
  }
  /**
   *
   * 将文档的最新内容初始化为 A
   * @param {Object} {obj}
   * @param {Object} {obj.doc}
   */
  initA({doc}) {
    const { atext } = doc;
    this.A = Changeset.pack(0, atext.text.length, atext.attribs, atext.text);
    this.Aunpacked = {oldLen: 0, newLen: atext.text.length, ops: atext.attribs, charBank: atext.text};
  }
  /**
   *
   *初始化 X 的函数
   * @param {*} {obj}
   * @param {Number} {obj.length}
   */
  initX({length}) {
    this.X = Changeset.identity(length);
    this.Xunpacked = { oldLen: length, newLen: length, ops: '', charBank: ''};
  }
  /**
   *
   *初始化 Y 的函数
   * @param {*} {obj}
   * @param {Number} {obj.length}
   */
  initY({length}) {
    this.Y = Changeset.identity(length);
    this.Yunpacked = { oldLen: length, newLen: length, ops: '', charBank: ''};
  }
  /**
   *合并 Y 和 当前编辑器输入 E
   *
   * @param {*} {obj}
   * @param {*} {obj.Y}
   * @param {*} {obj.E}
   */
  composeYE({Y, E, pool}) {
    return Changeset.compose(Y, E, pool);
  }

  initDoc({doc}) {
    if (this._initOK) {
      console.log('already init ok');
      return;
    }
    const text = doc.atext.text;
    // console.log(this.reactQuillRef);
    // console.log(this.quillRef);
    // this.quillRef.setText(text, 'silent');
    this.initA({doc});
    this.initX({length: text.length});
    this.initY({length: text.length});
    this._pool = (new AttributePool()).fromJsonable(doc.pool);
    this._baseRev = doc.head;
    const delta = cs2delta({ cs: this.A, pool: this._pool});
    console.log('initDoc');
    this.debugAXY();
    this.quillRef.setContents(delta, 'slient');
    this._initOK = true;
    this._YoldFullText = text;
  }
  async fetchData() {
    this.socket.emit("initDoc", this.docId);
    await new Promise((resovle, reject) => {
      this.socket.on("initDoc", doc => {
        console.log(doc);
        // 这里静默加载内容
        this.initDoc({doc});
        resovle();
      });
    });
  }
  componentDidMount() {
    this.fetchData();
    this.attachQuillRefs();
    this.sendServerY = setInterval(()=>{
      // 定时发送 Y 500ms
      // send Y to server
      // X <- Y
      // Y <- identity
      if (!this._initOK) {
        return;
      }
      if (this.Y === '' || Changeset.isIdentity(this.Y)) {
        return;
      }
      this.socket.emit('syncEvent', {changeset: this.Y, pool: this._pool, docId: this.docId, baseRev: this._baseRev});
      this.X = this.Y;
      this.Xunpacked = this.Yunpacked;
      // 现在 Y 的长度应该是 newLen
      this.initY({ length: this.Yunpacked.newLen});
    }, 500);
  }
  
  componentDidUpdate() {
    this.attachQuillRefs();
  }
  
  attachQuillRefs = () => {
    if (typeof this.reactQuillRef.getEditor !== 'function') return;
    this.quillRef = this.reactQuillRef.getEditor();
  }
  debugAXY() {
    console.log('A:', this.Aunpacked, this.A);
    console.log('X:', this.Xunpacked, this.X);
    console.log('Y:', this.Yunpacked, this.Y);
    console.log('pool', this._pool);
    console.log('baseRev', this._baseRev);
    console.log('YoldFullText', this._YoldFullText);
  }
  onChange(content, delta, source, editor) {
    // console.log(editor);
    // console.log(this.quillRef);
    // console.log(editor.getText());
    // console.log(content);
    // console.log(source); // user client(silent)
    // console.log(editor);
    // const c = editor.getContents();
    // console.log(c);
    // 这里不能使用 updateContents 更新 text, 导致 loop。
    if (source!=='user') {
      return;
    }
    console.log(delta);
    this.debugAXY();
    // 这里视图上已经渲染了最新的编辑 delta， 需要同步到 Y 上 Y <- YE
    const YnewLen = this.Yunpacked.newLen;
    // const E = delta2cs({ delta, oldLen: YnewLen, pool: this._pool });
    const E = delta2csLines({ delta, oldFullText: this._YoldFullText, oldLen: YnewLen, pool: this._pool });
    console.log('当前delta的cs', delta, E);
    // 合并 Y and E
    this.Y = this.composeYE({Y: this.Y, E, pool: this._pool});
    this.Yunpacked = Changeset.unpack(this.Y);
    const YEText = editor.getText();
    this._YoldFullText = YEText;
    console.log('Y and YETex', this.Yunpacked, YEText);
  }
  
  render() {
    return (
      <div>
        <Button
          disabled
          onClick={() => {
            this.quillRef.updateContents(new Delta([{retain: 10}, { insert: 'haha'}]), 'silent');
          }}
        >
          haha
        </Button>
        <ReactQuill 
          ref={(el) => { this.reactQuillRef = el }}
          theme={'snow'} 
          modules={this.modules}
          formats={this.formats}
          onChange={this.onChange}  
        />
      </div>
    )
  }
}
const DocContainer = () => {
  // console.log(window.location);
  const port = socketConfig.port;
  const ioUrl = `${window.location.protocol}//${window.location.hostname}:${port}/`;
  console.log(ioUrl);
  const socket = io(ioUrl);
  socket.on("connect", () => {
    console.log(`container: ${socket.id}`);
  });
  const docId =  7|| Math.ceil(Math.random() * 10);
  return (
    <div className={styles.normal}>
      <Editor className={styles.doc} docId={docId} socket={socket} />
      {/* <ReactQuill 
          theme={'snow'} 
          onChange={(content, delta, source)=>{
            console.log(delta);
          }}  
        /> */}
    </div>
  );
};
export default DocContainer;
