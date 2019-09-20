import styles from "./doc.css";
import io from "socket.io-client";
import { Button } from "antd";
import ReactQuill from "react-quill";
import "react-quill/dist/quill.snow.css"; // ES6
// with ES6 import
import React, { useState, useEffect, useRef } from "react";
// import { Delta } from "quill";
import Delta from "quill-delta";
const Changeset = require("../utils/Changeset");
const AttributePool = require("../utils/AttributePool");
const socketConfig = { port: 5000 };
function attachEvent(socket) {
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
}
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
function cs2delta({ cs, pool }) {
  const delta = new Delta();
  const unpacked = Changeset.unpack(cs);
  const csIter = Changeset.opIterator(unpacked.ops);
  const bankIter = Changeset.stringIterator(unpacked.charBank);
  while (csIter.hasNext()) {
    const op = csIter.next();
    switch (op.opcode) {
      case "+":
        delta.insert(bankIter.take(op.chars));
        break;
      case "-":
        delta.delete(op.chars);
        break;
      case "=":
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
/**
 *
 *
 * @param {Object} {delta}
 * @param {Number} {oldLen}
 * @param {AttributePool} {pool}
 */
function delta2cs({ delta, oldLen, pool }) {
  let bank = ""; // from insert
  let opsStr = ""; // transform the insert and attribues
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
  for (const op of delta.ops) {
    if (op.retain) {
      opsStr += `=${Changeset.numToString(op.retain)}`;
      if (op.attributes) {
      }
    } else if (op.insert) {
      newLen += op.insert.length;
      bank += op.insert;
      opsStr += `+${Changeset.numToString(op.insert.length)}`;
      // opsStr
      // todo attributes
      if (op.attributes) {
      }
    } else if (op.delete) {
      opsStr += `-${Changeset.numToString(op.delete)}`;
      newLen -= op.delete;
    } else {
      console.log(`wrong op: ${JSON.stringify(op)}`);
    }
  }
  return Changeset.pack(oldLen, newLen, opsStr, bank);
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

const DocComponent = ({ docId, socket }) => {
  const modules = MODULES;
  const formats = FORMATS;
  attachEvent(socket);
  const reactQuillRef = useRef(null);
  const [text, setText] = useState("");
  var A, X, Y;
  var Aunpacked, Xunpacked, Yunpacked;
  var _pool; // AttributePool 实例
  var _baseRev;
  /**
   *
   * 将文档的最新内容初始化为 A
   * @param {Object} {obj}
   * @param {Object} {obj.doc}
   */
  function initA({ doc }) {
    const { atext } = doc;
    A = Changeset.pack(0, atext.text.length, atext.attribs, atext.text);
    Aunpacked = {
      oldLen: 0,
      newLen: atext.text.length,
      ops: atext.attribs,
      charBank: atext.text
    };
  }
  /**
   *
   *初始化 X 的函数
   * @param {*} {obj}
   * @param {Number} {obj.length}
   */
  function initX({ length }) {
    X = Changeset.identity(length);
    Xunpacked = { oldLen: length, newLen: length, ops: "", charBank: "" };
  }
  /**
   *
   *初始化 Y 的函数
   * @param {*} {obj}
   * @param {Number} {obj.length}
   */
  function initY({ length }) {
    Y = Changeset.identity(length);
    Yunpacked = { oldLen: length, newLen: length, ops: "", charBank: "" };
  }
  /**
   *合并 Y 和 当前编辑器输入 E
   *
   * @param {*} {obj}
   * @param {*} {obj.Y}
   * @param {*} {obj.E}
   */
  function composeYE({ Y, E, pool }) {
    return Changeset.compose(
      Y,
      E,
      pool
    );
  }

  const initDoc = doc => {
    const quillRef = reactQuillRef.current.getEditor();
    // console.log(reactQuillRef);
    // console.log(quillRef);
    // quillRef.setText(doc.atext.text, 'silent');
    initA({ doc });
    initX({ length: doc.atext.text.length });
    initY({ length: doc.atext.text.length });
    _pool = new AttributePool().fromJsonable(doc.pool);
    _baseRev = doc.head;
    const delta = cs2delta({ cs: A, pool: _pool });
    quillRef.setContents(delta, "slient");
  };
  const debugAXY = () => {
    console.log("A:", Aunpacked, A);
    console.log("X:", Xunpacked, X);
    console.log("Y:", Yunpacked, Y);
    console.log("pool", _pool);
    console.log("baseRev", _baseRev);
  };
  useEffect(() => {
    async function fetchData() {
      socket.emit("initDoc", docId);
      await new Promise((resovle, reject) => {
        socket.on("initDoc", doc => {
          console.log(doc);
          setText(doc.atext.text);
          // 这里静默加载内容
          initDoc(doc);
          resovle();
        });
      });
    }
    console.log("on effect");
    fetchData();
    const sendServerY = setInterval(() => {
      // 定时发送 Y 500ms
      // send Y to server
      // X <- Y
      // Y <- identity
      // socket.emit('syncEvent', {changeset: Y, pool: _pool, docId, baseRev: _baseRev});
      // X = Y;
      // Xunpacked = Yunpacked;
      // // 现在 Y 的长度应该是 newLen
      // initY({length: Yunpacked.newLen});
      console.log("on interval");
    }, 500);
    return () => clearInterval(sendServerY);
  }, []);
  socket.on("syncAck", data => {
    // 监听到 ack
    // A <- AX
    // X <- identity
    const { docId, revNum } = data;
    A = Changeset.compose(
      A,
      X
    );
    console.log("sync ack revNum, baseRev", revNum, _baseRev);
    _baseRev = revNum;
    initX({ length: Xunpacked.newLen });
  });
  socket.on("userChange", data => {
    const { docId, changeset, pool, revNum } = data;
    // 从服务器得到了 B，需要计算出对应的 ops 并且 silent 更新 editor
    const apool = new AttributePool().fromJsonable(pool);
    const Api = Changeset.compose(
      A,
      changeset,
      apool
    );
    const Xpi = Changeset.follow(changeset, X, false, apool);
    const Bpi = Changeset.follow(X, changeset, false, apool);
    const Ypi = Changeset.follow(Bpi, Y, false, apool);
    const D = Changeset.follow(Y, Bpi, false, true);
    A = Api;
    Aunpacked = Changeset.unpack(A);
    X = Xpi;
    Xunpacked = Changeset.unpack(X);
    Y = Ypi;
    Yunpacked = Changeset.unpack(Y);
    // 当前的视图，应该是 D 的 cs2delta
    // 此时需要更新本地的 pool 吗
    _pool = apool;
    console.log("user change revNum, baseRev", revNum, _baseRev);
    _baseRev = revNum;
    const delta = cs2delta({ cs: D, pool: _pool });
    const quillRef = reactQuillRef.current.getEditor();
    quillRef.updateContents(delta, "silent");
  });
  const onChange = (content, delta, source, editor) => {
    // console.log(content);
    // console.log(source); // user client(silent)
    // console.log(editor);
    // const c = editor.getContents();
    // console.log(c);
    // 这里不能使用 updateContents 更新 text, 导致 loop。
    console.log(delta);
    debugAXY();
    const YnewLen = Yunpacked.newLen;
    const E = delta2cs({ delta, oldLen: YnewLen, pool: _pool });
    console.log("当前delta的cs", delta, E);
    // 合并 Y and E
    Y = composeYE({ Y, E, pool: _pool });
    Yunpacked = Changeset.unpack(Y);
    const YEText = editor.getText();
    console.log("Y and YETex", Yunpacked, YEText);
    setText(YEText);
  };

  // mounted and init text, other wise do not care for componentWillUpdate etc.
  //  text 作为一个 state，需要在 onchange中不断更新吗？
  // 还是需要一个 ref 操作底层的内容。
  return (
    <div>
      <Button
        disabled
        onClick={() => {
          console.log(docId);
          console.log(text);
          setText(text + "haha");
          const quillRef = reactQuillRef.current.getEditor();
          // console.log(quillRef);
          quillRef.updateContents(
            new Delta([{ retain: 10 }, { insert: "haha" }]),
            "silent"
          );
        }}
      >
        haha
      </Button>
      <ReactQuill
        ref={reactQuillRef}
        theme="snow"
        modules={modules}
        formats={formats}
        // value={text}
        onChange={(...args) => onChange(...args)}
      ></ReactQuill>
    </div>
  );
};

export default DocComponent;
