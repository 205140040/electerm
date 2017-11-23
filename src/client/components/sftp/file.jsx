/**
 * file section
 */

import React from 'react'
import {Icon, Tooltip, Popconfirm} from 'antd'
import classnames from 'classnames'
import moment from 'moment'
import copy from 'json-deep-copy'
import _ from 'lodash'
import Input from '../common/input-auto-focus'
import resolve from '../../common/resolve'
import wait from '../../common/wait'
import {contextMenuHeight, contextMenuPaddingTop} from '../../common/constants'
import sorter from '../../common/index-sorter'

const {getGlobal} = window
const computePos = (e, isBg, height) => {
  let {target} = e
  let rect = target.getBoundingClientRect()
  let {clientX, clientY} = e
  let res = {
    left: isBg ? rect.left : clientX,
    top: isBg ? rect.top + 15 : clientY
  }
  if (window.innerHeight < res.top + height + 10) {
    res.top = res.top - height
  }
  return res
}

export default class FileSection extends React.Component {

  constructor(props) {
    super(props)
    this.state = {
      file: copy(props.file),
      overwriteStrategy: ''
    }
  }

  componentWillReceiveProps(nextProps) {
    if (!_.isEqual(nextProps.file, this.props.file)) {
      this.setState({
        file: copy(nextProps.file)
      })
    }
  }

  doRename = () => {
    let file = copy(this.state.file)
    file.nameTemp = file.name
    file.isEditting = true
    this.props.closeContextMenu()
    this.setState({
      file
    })
  }

  onCloseFileInfo = () => {
    this.props.rootModifier({
      fileInfoModalProps: {}
    })
  }

  showInfo = () => {
    this.props.closeContextMenu()
    this.props.rootModifier({
      fileInfoModalProps: {
        file: this.state.file,
        tab: this.props.tab,
        visible: true,
        onClose: this.onCloseFileInfo
      }
    })
  }

  cancelNew = (type) => {
    let list = this.props[type]
    list = list.filter(p => p.id)
    this.props.modifier({
      [type]: list
    })
  }

  localCreateNew = async file => {
    let {nameTemp, isDirectory} = file
    let {localPath} = this.props
    let p = resolve(localPath, nameTemp)
    let fs = getGlobal('fs')
    let func = isDirectory
      ? fs.mkdirAsync
      : fs.touch
    let res = await func(p)
      .then(() => true)
      .catch(this.props.onError)
    if (res) {
      this.props.localList()
    }
  }

  remoteCreateNew = async file => {
    let {nameTemp, isDirectory} = file
    let {remotePath, sftp} = this.props
    let p = resolve(remotePath, nameTemp)
    let func = isDirectory
      ? sftp.mkdir
      : sftp.touch
    let res = await func(p)
      .then(() => true)
      .catch(this.props.onError)
    if (res) {
      await wait(500)
      await this.props.remoteList()
    }
  }

  selectAll = (e) => {
    let {type} = this.props.file
    this.props.closeContextMenu()
    this.props.selectAll(type, e)
  }

  createNew = file => {
    let {type} = file
    return this[`${type}CreateNew`](file)
  }

  getShiftSelected(file, type) {
    let indexs = this.props.selectedFiles.map(
      this.props.getIndex
    )
    let i = this.props.getIndex(file)
    let lastI = this.props.getIndex(this.props.lastClickedFile)
    let arr = [...indexs, i].sort(sorter)
    let last = arr.length - 1
    let from = arr[0]
    let to = arr[last]
    let [start, end] = [from, to]
    if (indexs.includes(i)) {
      let other = lastI > i ? from : to
      ;[start, end] = [other, i].sort(sorter)
    }
    return this.props[type].slice(start, end + 1)
  }

  onClick = e => {
    let {file} = this.state
    let {
      id,
      type
    } = file
    if (!id) {
      return
    }
    let selectedFilesOld = copy(
      this.props.selectedFiles
    )
    let isSameSide = selectedFilesOld.length
      && type === selectedFilesOld[0].type
    let selectedFiles = [file]
    if (isSameSide) {
      if (e.ctrlKey) {
        let isSelected = _.some(
          selectedFilesOld,
          s => s.id === id
        )
        selectedFiles = isSelected
          ? selectedFilesOld.filter(s => s.id !== id)
          : [
            ...copy(selectedFilesOld),
            file
          ]
      } else if (e.shiftKey) {
        selectedFiles = this.getShiftSelected(file, type)
      }
    }
    this.props.modifier({
      selectedFiles,
      lastClickedFile: file
    })
  }

  onBlur = () => {
    let file = copy(this.state.file)
    let {nameTemp, name, id, type} = this.state.file
    if (name === nameTemp) {
      if (!id) {
        return this.cancelNew(type)
      }
      delete file.nameTemp
      delete file.isEditting
      return this.setState({
        file
      })
    }
    if (!id) {
      return this.createNew(file)
    }
    this.rename(name, nameTemp)
  }

  rename = (oldname, newname) => {
    let {type} = this.props.file
    return this[`${type}Rename`](oldname, newname)
  }

  localRename = async (oldname, newname) => {
    let {localPath} = this.props
    let fs = getGlobal('fs')
    let p1 = resolve(localPath, oldname)
    let p2 = resolve(localPath, newname)
    await fs.renameAsync(p1, p2).catch(this.props.onError)
    this.props.localList()
  }

  remoteRename = async (oldname, newname) => {
    let {remotePath, sftp} = this.props
    let p1 = resolve(remotePath, oldname)
    let p2 = resolve(remotePath, newname)
    let res = await sftp.rename(p1, p2)
      .catch(this.props.onError)
      .then(() => true)
    if (res) {
      this.props.remoteList()
    }
  }

  onChange = e => {
    let nameTemp = e.target.value
    let file = copy(this.state.file)
    file.nameTemp = nameTemp
    this.setState({
      file
    })
  }

  enterDirectory = (e, file) => {
    e.stopPropagation()
    let {type, name} = file || this.state.file
    let n = `${type}Path`
    let path = this.props[n]
    let np = resolve(path, name)
    this.props.modifier({
      [n]: np,
      [n + 'Temp']: np
    }, this.props[`${type}List`])
  }

  transferOrEnterDirectory = (e) => {
    let {isDirectory} = this.state.file
    if (isDirectory) {
      return this.enterDirectory(e)
    }
    this.transfer()
  }

  getTransferList = async (file) => {
    let {isDirectory, name, path, type} = file
    if (!isDirectory) {
      return [file]
    }
    let p = resolve(path, name)
    let files = await this.props[`${type}List`](true, p)
    let res = [file]
    for (let f of files) {
      let cs = await this.getTransferList(f)
      res = [...res, ...cs]
    }
    return res
  }

  doTransferSelected = async () => {
    this.props.closeContextMenu()
    let {selectedFiles} = this.props
    let filesToConfirm = []
    for (let f of selectedFiles) {
      let arr = await this.getTransferList(f)
      filesToConfirm = [
        ...filesToConfirm,
        ...arr
      ]
    }
    this.props.modifier({
      filesToConfirm
    })
  }

  transfer = async () => {
    let arr = await this.getTransferList(this.state.file)
    this.props.modifier({
      filesToConfirm: arr
    })
  }

  doEnterDirectory = (e) => {
    this.props.closeContextMenu()
    this.enterDirectory(e)
  }

  refresh = () => {
    this.props.closeContextMenu()
    this.props.onGoto(this.props.file.type)
  }

  del = async (delSelected) => {
    this.props.closeContextMenu()
    let {file, selectedFiles} = this.props
    let {type} = file
    let files = delSelected
      ? selectedFiles
      : [file]
    await this.props.delFiles(type, files)
  }

  doTransfer = () => {
    this.props.closeContextMenu()
    this.transfer()
  }

  newFile = () => {
    return this.newItem(false)
  }

  newDirectory = () => {
    return this.newItem(true)
  }

  newItem = (isDirectory) => {
    let {type} = this.state.file
    let list = this.props[type]
    list.unshift({
      name: '',
      nameTemp: '',
      isDirectory,
      isEditting: true,
      type
    })
    this.props.closeContextMenu()
    this.props.modifier({
      [type]: list
    })
  }

  renderDelConfirmTitle(shouldShowSelectedMenu) {
    let {file, selectedFiles} = this.props
    let files = shouldShowSelectedMenu
      ? selectedFiles
      : [file]
    return this.props.renderDelConfirmTitle(files)
  }

  renderContext() {
    let {
      file: {
        type,
        isDirectory,
        id
      },
      selectedFiles
    } = this.props
    let transferText = type === 'local'
      ? 'upload'
      : 'download'
    let icon = type === 'local'
      ? 'cloud-upload-o'
      : 'cloud-download-o'
    let len = selectedFiles.length
    let shouldShowSelectedMenu = id
      && len > 1
      && _.some(selectedFiles, d => d.id === id)
    let cls = 'pd2x pd1y context-item pointer'
    let delTxt = shouldShowSelectedMenu ? `delete all(${len})` : 'delete'
    return (
      <div>
        {
          isDirectory && id
            ? (
              <div
                className={cls}
                onClick={this.doEnterDirectory}
              >
                <Icon type="enter" /> enter
              </div>
            )
            : null
        }
        {
          shouldShowSelectedMenu
            ? (
              <div
                className={cls}
                onClick={this.doTransferSelected}
              >
                <Icon type={icon} /> {transferText} selected({len})
              </div>
            )
            : null
        }
        {
          !id
            ? null
            : (
              <div
                className={cls}
                onClick={this.doTransfer}
              >
                <Icon type={icon} /> {transferText}
              </div>
            )
        }
        {
          id
            ? (
              <Popconfirm
                title={this.renderDelConfirmTitle(shouldShowSelectedMenu)}
                onConfirm={() => this.del(shouldShowSelectedMenu)}
              >
                <div
                  className={cls}
                >
                  <Icon type="close-circle" /> {delTxt}
                </div>
              </Popconfirm>
            )
            : null
        }
        {
          id
            ? (
              <div
                className={cls}
                onClick={this.doRename}
              >
                <Icon type="edit" /> rename
              </div>
            )
            : null
        }
        <div
          className={cls}
          onClick={this.newFile}
        >
          <Icon type="file-add" /> new file
        </div>
        <div
          className={cls}
          onClick={this.newDirectory}
        >
          <Icon type="folder-add" /> new directory
        </div>
        <div
          className={cls}
          onClick={this.selectAll}
        >
          <Icon type="check-square-o" /> select all
        </div>
        <div
          className={cls}
          onClick={this.refresh}
        >
          <Icon type="reload" /> refresh
        </div>
        {
          id
            ? (
              <div
                className={cls}
                onClick={this.showInfo}
              >
                <Icon type="info-circle-o" /> info
              </div>
            )
            : null
        }
      </div>
    )
  }

  onContextMenu = e => {
    e.preventDefault()
    let {id} = this.props.file
    let content = this.renderContext()
    let height = content.props.children.filter(_.identity)
      .length * contextMenuHeight + contextMenuPaddingTop * 2
    this.props.openContextMenu({
      content,
      pos: computePos(e, id, height)
    })
  }

  renderEditting(file) {
    let {
      nameTemp,
      isDirectory
    } = file
    let icon = isDirectory ? 'folder' : 'file'
    let pre = <Icon type={icon} />
    return (
      <div className="sftp-item">
        <Input
          value={nameTemp}
          addonBefore={pre}
          onChange={this.onChange}
          onBlur={this.onBlur}
          onPressEnter={this.onBlur}
        />
      </div>
    )
  }

  render() {
    let {type, selectedFiles} = this.props
    let {file} = this.state
    let {
      name,
      size,
      isDirectory,
      modifyTime,
      id,
      isEditting
    } = file
    if (isEditting) {
      return this.renderEditting(file)
    }
    let selected = _.some(selectedFiles, s => s.id === id)
    let cls = classnames('sftp-item', type, {
      directory: isDirectory
    }, {selected})
    let pm = type === 'remote'
      ? 'left'
      : 'right'
    let title = (
      <div>
        <p>{name}</p>
        <p>modifyTime: {moment(modifyTime).format()}</p>
      </div>
    )
    return (
      <div
        className={cls}
        onDoubleClick={this.transferOrEnterDirectory}
        onContextMenu={this.onContextMenu}
        onClick={this.onClick}
      >
        <Tooltip
          title={title}
          placement={pm}
        >
          <div className="sftp-item-title elli iblock">
            {
              isDirectory
                ? <Icon type="folder" />
                : <Icon type="file" />
            }
            <span className="mg1l">{name}</span>
          </div>
        </Tooltip>
        {
          isDirectory
            ? null
            : <div className="sftp-item-size elli iblock">{size}</div>
        }
      </div>
    )
  }
}