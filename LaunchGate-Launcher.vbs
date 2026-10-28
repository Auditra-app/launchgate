' ==============================================================================
' LaunchGate Silent Background Launcher & Watchdog
' 1-Click Desktop Launcher for LaunchGate Command Center
' Ensures server is automatically started if not running, then opens UI
' ==============================================================================

Option Explicit

Dim WshShell, fso, scriptDir, serverScript, isRunning, i, startedOk, msgRes

Set WshShell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

' Get project root directory where this script lives
scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
serverScript = scriptDir & "\server.js"

' Ensure working directory is the project directory
WshShell.CurrentDirectory = scriptDir

' Locate node executable reliably
Function FindNodeExe()
    On Error Resume Next
    Dim testPath
    testPath = "C:\Program Files\nodejs\node.exe"
    If fso.FileExists(testPath) Then
        FindNodeExe = testPath
        Exit Function
    End If
    testPath = WshShell.ExpandEnvironmentStrings("%LOCALAPPDATA%\Programs\nodejs\node.exe")
    If fso.FileExists(testPath) Then
        FindNodeExe = testPath
        Exit Function
    End If
    testPath = "C:\Program Files (x86)\nodejs\node.exe"
    If fso.FileExists(testPath) Then
        FindNodeExe = testPath
        Exit Function
    End If
    FindNodeExe = "node.exe"
    On Error GoTo 0
End Function

' Function to check if LaunchGate server is already active on port 4545
Function CheckServerHealth()
    On Error Resume Next
    Dim xmlHttp
    CheckServerHealth = False
    Set xmlHttp = CreateObject("MSXML2.ServerXMLHTTP.6.0")
    If Err.Number <> 0 Then
        Err.Clear
        Set xmlHttp = CreateObject("MSXML2.ServerXMLHTTP")
    End If
    
    xmlHttp.setTimeouts 500, 500, 500, 500
    xmlHttp.open "GET", "http://127.0.0.1:4545/api/system/health", False
    xmlHttp.send
    
    If Err.Number = 0 Then
        If xmlHttp.status = 200 Then
            CheckServerHealth = True
        End If
    End If
    Set xmlHttp = Nothing
    On Error GoTo 0
End Function

' Subroutine to launch node server as an independent detached background process (0 window)
Sub StartBackgroundServer()
    On Error Resume Next
    Dim objWMIService, objProcessStartup, intProcessID, cmd, nodeExe
    nodeExe = FindNodeExe()
    
    Set objWMIService = GetObject("winmgmts:\\.\root\cimv2")
    Set objProcessStartup = objWMIService.Get("Win32_ProcessStartup").SpawnInstance_
    objProcessStartup.ShowWindow = 0 ' 0 = SW_HIDE
    
    cmd = """" & nodeExe & """ """ & serverScript & """"
    objWMIService.Get("Win32_Process").Create cmd, scriptDir, objProcessStartup, intProcessID
    
    If Err.Number <> 0 Then
        Err.Clear
        WshShell.Run """" & nodeExe & """ """ & serverScript & """", 0, False
    End If
    On Error GoTo 0
End Sub

' 1. Check if server is already running
isRunning = CheckServerHealth()

If Not isRunning Then
    ' 2. Server is not running: launch completely hidden in background
    StartBackgroundServer()

    ' 3. Wait until server responds (poll every 250ms, up to 10 seconds)
    startedOk = False
    For i = 1 To 40
        WScript.Sleep 250
        If CheckServerHealth() Then
            startedOk = True
            Exit For
        End If
    Next

    If Not startedOk Then
        msgRes = MsgBox("LaunchGate server did not respond within 10 seconds." & vbCrLf & vbCrLf & _
                        "Would you like to open the diagnostic console to inspect the server output?", _
                        vbYesNo + vbExclamation, "LaunchGate Startup Alert")
        If msgRes = vbYes Then
            WshShell.Run """" & scriptDir & "\start.bat""", 1, False
        End If
        WScript.Quit 1
    End If
End If

' 4. Server confirmed healthy - open dashboard in default browser
WshShell.Run "http://localhost:4545", 1, False

Set WshShell = Nothing
Set fso = Nothing
