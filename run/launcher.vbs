Option Explicit

Dim shell
Dim fso
Dim scriptDir
Dim powershellPath
Dim command

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
powershellPath = shell.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\WindowsPowerShell\v1.0\powershell.exe"

If Not fso.FileExists(powershellPath) Then
  powershellPath = "powershell.exe"
End If

command = """" & powershellPath & """ -NoLogo -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File """ & scriptDir & "\launcher.ps1"""
shell.Run command, 0, False
