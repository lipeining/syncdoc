http://slix.rocks/%E5%9C%A8%E7%BA%BF%E6%96%87%E6%A1%A3%E4%B8%AD-easysync2-%E7%AE%97%E6%B3%95%E4%BB%8B%E7%BB%8D/

最简单的是：follow ver->current ver
applyToText 即可。
使用数组记录（{text, ver, str}）
需要准确的处理 retain, insert, delete 三种情况。

redis,缓存，内存中保留的对象，需要是服务器模型的一个文档，
Atext,changeset,,pool,versionNumber,createTime,id.根据需要可以缓存 revs 在内存。
数据库中需要方便复原一个内存中的文档。
cs 是一个递增的操作列表，在一定时间时会关联到一个 atext 表，得到对应的 Atext 实例
Atext = { text, attribs};
pool 相当于全局变量，需要不断更新到数据库中。
version number 需要不断更新，关联到每一个表中。
获取一系列的 cs,然后
atext = Changeset.applyToAText(cs,atext,pool);

服务器操作：
客户端传入 baseRev, apool, changeset.
此时服务器需要准备好 baseRev, apool, changeset，检查其正确性。

> 版本号不可以超前，
> Changeset.checkReq 检查 changeset 的长度，运算符是否符合规则,
> Changeset.eachAttribNumber 和 apool.getAttrib 检查 apool 是否存在
> Changeset.opIterator(Changeset.unpack(changeset).ops) 生成迭代器，使用 \* 区分属性，检查每一个属性中的 author 是否都是
> 当前用户，其实这里有漏洞，如果都不加上 author 属性的话，那么就可以创建一个匿名的信息，应该是默认加上用户属性才对。

wireApool=(new AttributePool()).fromJsonable(client.apool); // 客户端的 pool

pad 服务器的信息

changeset=Changeset.moveOpsToNewPool(changset, wireApool, pad.pool);

通过客户端的 baseRev,得到其对应的需要合并的 changesets.

```js
for (const needFollowCS of needFollowCSs) {
  changeset = Changeset.follow(needFollowCS, changeset, false, apool); // false 指代，客户端的先操作。
  baseRev++;
}
```

此时，这个 changeset 应该可以对应的到当前的文档的长度
Changeset.oldLen(changeset) === pad.Atext.text.length;
此时，baseRev 应该等于服务器的版本号。
在应用 changeset 之后，服务器版本号+1,

1.更新缓存的 changeset 为当前客户端传入的 changeset

2.将 changeset 应用到 AText, AText=Changeset.applyToAText(changeset,AText,pool)

3.更新服务器的版本号和最后更新时间

4.将对应的数据存入数据库中(全局 pool,cs 新增记录)
